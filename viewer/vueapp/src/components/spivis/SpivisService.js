import Vue from 'vue';
import FeatureExtractionService from './FeatureExtractionService';

export default {
  RANY: 'raw', // common starting text
  RALL: 'rawAll',
  RSRC: 'rawSrc',
  RDST: 'rawDst',
  FEATURE: 'feature',

  FIELD: {
    number: { id: 0, icon: 'fa-hashtag', name: 'Number', vegaType: 'quantitative' }, // can be temporal
    string: { id: 1, icon: 'fa-text-width', name: 'Text', vegaType: 'nominal' },
    numberarray: { id: 2, icon: 'fa-list-ol', name: 'Number Array', vegaType: 'ordinal' },
    stringarray: { id: 3, icon: 'fa-list', name: 'Text Array', vegaType: 'ordinal' },
    object: { id: 4, icon: 'fa-list', name: 'Array', vegaType: 'ordinal' },
    statfeature: { id: 5, icon: 'fa-calculator', name: 'Statistics', vegaType: 'quantitative' },
    ctrfeature: { id: 6, icon: 'fa-asterisk', name: 'Counter', hide: true, vegaType: 'quantitative' },
    single: { id: 7, icon: 'fa-check', name: 'Single', hide: true, vegaType: 'nominal' },
    other: { id: 8, icon: 'fa-bar-chart', name: 'Other', vegaType: 'nominal' }
  },
  /* service methods ------------------------------------------------------- */
  /**
   * Gets raw packet data from the server
   * @param {string} nodeName     Name of the node to query
   * @param {[string]} ids        List of ids to get raw data for
   * @param {object} cancelToken  Token to cancel the request
   * @returns {Promise} Promise   A promise object that signals the completion or rejection of the request.
   */
  getRaw: function (nodeName, ids, cancelToken) {
    return new Promise((resolve, reject) => {
      const options = {
        url: `api/session/raw/${nodeName}`,
        method: 'POST',
        data: { ids },
        cancelToken: cancelToken
      };

      Vue.axios(options)
        .then((response) => {
          if (response.data.error) { reject(response.data.error); }
          resolve(response);
        }, (error) => {
          if (!Vue.axios.isCancel(error)) {
            reject(error);
          }
        });
    });
  },
  // extract all field values from all packets, sort them by length
  extractFields: function (packets) {
    const fields = {};
    for (const packet of packets) {
      for (const [key, value] of Object.entries(packet)) {
        // do not process any raw fields, by filtering with RANY
        if (!fields[key]) { fields[key] = {}; }
        // this trick "hashes" the value, so we get a Map(hash, value)
        // it's actually faster to overwrite than to check if it's set
        fields[key][value] = value;
      }
    }
    return Object.fromEntries(Object.entries(fields)
      .map(([k, v]) => [k, Object.values(v)]) // get values from our "hashmap"
      .sort((a, b) => b[1].length - a[1].length)); // sort entries by length
  },
  // extract type of fields (single, number, string, categorical, array...)
  extractFieldTypes: function (packetFields) {
    const entries = Object.entries(packetFields).map(([key, values]) => {
      if (values.length <= 1) {
        return [key, this.FIELD.single.id]; // special type: single
      } else if (key.startsWith(FeatureExtractionService.CTR) || key.startsWith(FeatureExtractionService.STATS)) {
        const typ = key.split(FeatureExtractionService.SEP)[0] + this.FEATURE;
        return [key, this.FIELD[typ].id];
      } else if (values.every((v) => typeof values[0] === typeof v)) {
        return [key, this.FIELD[typeof values[0]].id];
      } else {
        return [key, this.FIELD.other.id];
      }
    });
    return Object.fromEntries(entries);
  },
  deleteStats: function (packets, packetFields, fieldTypes) {
    const toDel = Object.keys(packetFields)
      .filter((n) => n.startsWith(this.STATS) || n.startsWith(this.CTR));
    // console.log(toDel);
    toDel.forEach((n) => {
      packets.forEach((p) => delete p[n]);
      delete packetFields[n];
      delete fieldTypes[n];
    });
  },
  // if array-fields have only elments of length 1, take them
  fixFields: function (itemFields, fieldTypes, packets) {
    const fieldCount = {};
    for (let [title, type] of Object.entries(fieldTypes)) {
      if (type === this.FIELD.object.id) {
        if (itemFields[title].every((v) => v.length === 1)) {
          fieldTypes[title] = this.FIELD[typeof itemFields[title][0][0]].id;
          itemFields[title] = itemFields[title].map((v) => v[0]).sort();
          for (const item of packets) {
            if (item[title]) {
              item[title] = item[title].map((v) => v[0]);
            }
          }
        } else {
          const typeName = (typeof itemFields[title][0][0]) + 'array';
          fieldTypes[title] = this.FIELD[typeName].id;
        }
      }
      type = fieldTypes[title];
      if (!fieldCount[type]) { fieldCount[type] = 0; }
      fieldCount[type]++;
    }
    return fieldCount;
  },
  loadPacketsRaw: async function (packetsMeta) {
    const packetsRaw = new Array(packetsMeta.length); // result array
    const nodeSessionId = {};
    packetsMeta.filter((p) => p.totDataBytes).forEach((p) => {
      nodeSessionId[p.node] = (nodeSessionId[p.node] || []).concat([p.id]);
    });
    const nodeSessionTuples = Object.entries(nodeSessionId);
    const promises = nodeSessionTuples.map(([node, sessionIds]) =>
      this.getRaw(node, sessionIds, Vue.axios.CancelToken.source().token));
    await Promise.all(promises).then((response) => {
      const rd = Object.assign(...response.map((r) => r.data));
      this.assignPackets(packetsMeta, rd, packetsRaw);
    }, (err) => console.log(err));
    return packetsRaw;
  },
  assignPackets: function (packets, respPackets, packetsRaw) {
    for (const [idx, packet] of packets.entries()) {
      const respSession = respPackets[packet.id];
      const p = Object.fromEntries([[this.RALL, ''], [this.RSRC, ''], [this.RDST, '']]);
      for (let i = 0; i < respSession?.length; i++) {
        if (i % 2) {
          p[this.RSRC] += respSession[i];
        } else {
          p[this.RDST] += respSession[i];
        }
        p[this.RALL] += respSession[i];
      }
      packetsRaw[idx] = p;
    }
  },
  vegaDatatypeOf: function (propName, fieldTypes) {
    const fieldType = Object.values(this.FIELD)
      .filter((ft) => ft.id === fieldTypes[propName])[0];
    if (this.values && this.values[0] && fieldType.vegaType === 'quantitative') {
      const v0 = this.values[0][propName];
      if (v0 > 1000000000000 && v0 < 2000000000000) {
        return 'temporal';
      }
    }
    return fieldType.vegaType;
  }
};
