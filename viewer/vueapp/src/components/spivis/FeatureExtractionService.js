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
const SEP = '_';

export default {
  CTR: 'ctr' + SEP,
  STATS: 'stat' + SEP,
  SEP,

  ctrToStats: function (counter) {
    // create dict with same keys as lookup
    const stats = {};
    for (let i = 0; i < 256; i++) {
      stats[LOOKUP[i]] = (stats[LOOKUP[i]] || 0) + counter[i];
    }
    return stats;
  },
  extractFeatureArray: function (packet, field) {
    const packetCtr = new Array(256).fill(0);
    for (const char8 of textEncoder.encode(packet[field])) {
      packetCtr[char8]++;
    }
    return packetCtr;
  },
  extractByteFeatures: function (packet, field) {
    return this.extractFeatureArray(packet, field).map((ctr, idx) => // set ctr and stats per packet
      [this.CTR + field + SEP + idx.toString(16).padStart(2, '0'), ctr]
    );
  },
  extractSymbolFeatures: function (packet, field) {
    const packetCtr = this.extractFeatureArray(packet, field);
    return Object.entries(this.ctrToStats(packetCtr)).map(([k, v]) =>
      [this.STATS + field + SEP + k, v]
    );
  },
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
  table: function (packets, featureExtractionFields) {
    const table = Object.fromEntries(featureExtractionFields.map(f => [f, {}]));
    packets.forEach(
      p => Object.entries(p).sort().forEach(
        ([field, packetData]) => {
          const [, packetField, featureField] = field.split(SEP);
          table[packetField][featureField] = table[packetField][featureField] || 0;
          table[packetField][featureField] += packetData;
        }));
    return Object.values(table);
  }
};
