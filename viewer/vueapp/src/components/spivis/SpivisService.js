import Vue from 'vue';

const LOOKUP_TABLE = { // used to generate LOOKUP + table headers for statistics
  C: 'control',
  W: 'white',
  S: 'special',
  N: 'number',
  U: 'upper',
  L: 'lower',
  E: 'eascii'
};
const CHAR_CLASSES =
  'CCCCCCCCCCWCCWCCCCCCCCCCCCCCCCCC' +
  'WSSSSSSSSSSSSSSSNNNNNNNNNNSSSSSS' +
  'SUUUUUUUUUUUUUUUUUUUUUUUUUUSSSSS' +
  'SLLLLLLLLLLLLLLLLLLLLLLLLLLSSSSC' +
  'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' +
  'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' +
  'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' +
  'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';

const LOOKUP = [...CHAR_CLASSES].map((pos) => LOOKUP_TABLE[pos]);

export default {
  CTR: 'ctr_',
  STATS: 'stat_',
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
  LOOKUP_TABLE,
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
      } else if (key.startsWith(this.CTR) || key.startsWith(this.STATS)) {
        const typ = key.split('_')[0] + this.FEATURE;
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
  loadPacketsRaw: function (packets, packetFields, doneCb) {
    if (packetFields?.node) {
      const nodeSessionId = {};
      if (packetFields.node.length > 1) {
        for (const p of this.packets) {
          if (p.totDataBytes && p[this.RALL]) {
            if (!nodeSessionId[p.node]) { // create container for node if it doesn't exist
              nodeSessionId[p.node] = [];
            }
            nodeSessionId[p.node].push(p.id);
          }
        }
      } else {
        nodeSessionId[packets[0].node] = packets.map((p) => p.id);
      }
      const nodeSessionTuples = Object.entries(nodeSessionId);
      let tasksTodo = nodeSessionTuples.length;
      for (const [node, sessionIds] of nodeSessionTuples) {
        const source = Vue.axios.CancelToken.source();
        this.getRaw(node, sessionIds, source.token).then((response) => {
          this.assignPackets(packets, response.data);
          if (--tasksTodo === 0) { doneCb(); }
        }, (err) => console.log(err));
      }
    }
  },
  assignPackets: function (packets, respPackets) {
    for (const packet of packets) {
      packets = respPackets[packet.id];
      packet[this.RALL] = '';
      packet[this.RSRC] = '';
      packet[this.RDST] = '';
      for (let i = 0; i < packets.length; i++) {
        if (i % 2) {
          packet[this.RSRC] += packets[i];
        } else {
          packet[this.RDST] += packets[i];
        }
        packet[this.RALL] += packets[i];
      }
    }
  },
  ctrToStats: function (counter) {
    // create dict with same keys as lookup
    const stats = Object.fromEntries(Object.values(LOOKUP_TABLE).map((v) => [v, 0]));
    for (let i = 0; i < 256; i++) {
      stats[LOOKUP[i]] += counter[i];
    }
    return stats;
  },
  calculateStatistics: function (packets, fields) {
    const te = new TextEncoder();
    const totalCtr = {};
    for (const field of fields) {
      totalCtr[field] = new Array(256).fill(0);
      for (const packet of packets) {
        const packetCtr = new Array(256).fill(0);
        for (const char8 of te.encode(packet[field])) {
          totalCtr[field][char8]++;
          packetCtr[char8]++;
        }
        // set ctr and stats per packet
        packetCtr.forEach((ctr, idx) => {
          packet[this.CTR + field + '_' + idx.toString(16).padStart(2, '0')] = ctr;
        });
        for (const [k, v] of Object.entries(this.ctrToStats(packetCtr))) {
          packet[this.STATS + field + '_' + k] = v;
        }
      }
    }
    // return overall statistics
    return Object.values(totalCtr).map(this.ctrToStats);
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
