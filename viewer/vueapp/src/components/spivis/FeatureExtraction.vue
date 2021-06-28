<template>
  <b-card title="Feature extraction"
          @drop="dropPush($event, fields, validator)"
          @dragenter.prevent @dragover.prevent>
    <b-form-tags v-model="fields"
                 :tag-validator="validator"
                 remove-on-delete
                 tag-class="btn btn-default"
                 placeholder="Enter valid Text [Array]"/>
    <b-input-group prepend="Method">
      <b-select v-model="method" :options="['byte', 'symbol']"/>
    </b-input-group>
    <b-table :items="table" :responsive="true" small
             tbody-class="statTable" thead-class="statTable">
      <!-- row label bold, rest to short numbers with K/M postfix -->
      <template #cell()="data"> {{ data.value | humanReadableBits }}</template>
    </b-table>
  </b-card>
</template>
<script>
import SpivisService from './SpivisService';
const textEncoder = new TextEncoder();
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
  name: 'FeatureExtraction',
  props: {
    dropPush: {},
    validator: {},
    packets: {},
    featurePackets: {}
  },
  data: function () {
    return {
      method: 'symbol',
      fields: [SpivisService.RSRC, SpivisService.RDST, SpivisService.RALL]
    };
  },
  computed: {
    table: function () {
      if (!this.featurePackets || !this.fields) return [];
      const t = Object.fromEntries(this.fields.map(f => [f, {}]));
      this.featurePackets.forEach(
        p => Object.entries(p).sort().forEach(
          ([field, packetData]) => {
            const [packetField, featureField] = field.split(SpivisService.SEP);
            t[packetField][featureField] = t[packetField][featureField] || 0;
            t[packetField][featureField] += packetData;
          }));
      return Object.values(t);
    }
  },
  watch: {
    fields: function () { this.recomputeFields(); },
    method: function () { this.recomputeFields(); },
    packets: function (oldPackets, newPackets) {
      if (!Object.keys(newPackets).length) return;
      oldPackets = Object.entries(oldPackets?.[0]).join('');
      newPackets = Object.entries(newPackets?.[0]).join('');
      if (oldPackets !== newPackets) {
        this.recomputeFields();
      }
    }
  },
  methods: {
    recomputeFields: function () {
      const featurePackets = this.extractFeatures(this.packets, this.fields, this.method);
      this.$emit('update:featurePackets', featurePackets);
    },
    ctrToStats: function (counter) {
      // create dict with same keys as lookup
      const stats = {};
      for (let i = 0; i < 256; i++) {
        stats[LOOKUP[i]] = (stats[LOOKUP[i]] || 0) + counter[i];
      }
      return stats;
    },
    // actual feature extraction logic
    extractFeatures: function (packets, fields, method) {
      if (!fields.length) { return []; }
      return packets.map((packet) => {
        const fieldResults = fields.map((field) => {
          return Object.fromEntries(method === 'byte'
            ? this.extractByteFeatures(packet, field)
            : this.extractSymbolFeatures(packet, field));
        });
        return Object.assign(...fieldResults);
      });
    },
    extractByteFeatures: function (packet, field) {
      return this.extractFeatureArray(packet, field).map((ctr, idx) => // set ctr and stats per packet
        [field + SpivisService.SEP + idx.toString(16).padStart(2, '0'), ctr]
      );
    },
    extractSymbolFeatures: function (packet, field) {
      const packetCtr = this.extractFeatureArray(packet, field);
      return Object.entries(this.ctrToStats(packetCtr)).map(([k, v]) =>
        [field + SpivisService.SEP + k, v]
      );
    },
    extractFeatureArray: function (packet, field) {
      const packetCtr = new Array(256).fill(0);
      for (const char8 of textEncoder.encode(packet[field])) {
        packetCtr[char8]++;
      }
      return packetCtr;
    }
  }
};
</script>
<style>

.col {  padding: 0.1rem; }

.statTable > tr > th {
  padding: 1px !important;
  font-size: 70%;
  text-align: center;
}

.statTable > tr > td {
  padding: 2px !important;
  text-align: right;
}

</style>
