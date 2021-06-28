<template>
  <div id="vega-container" class="full">
    {{ fieldNames }}
  </div>
</template>

<script>
// import vega-lite
import 'vega';
import 'vega-lite';
import embed from 'vega-embed';
import SpivisService from '../spivis/SpivisService';

const TEMPORAL_FIELDS = ['firstPacket', 'lastPacket', 'timestamp'];

export default {
  name: 'VegaLiteComponent',
  components: {},
  props: {
    values: Array,
    fieldTypes: {
      type: Object,
      default: () => { }
    },
    fieldNames: {
      type: Object,
      default: () => { }
    }
  },
  data: function () {
    return {
      mark: 'circle',
      data: { values: [] }, // pre-init valid
      width: 'container',
      height: 'container'
    };
  },
  computed: {
    encoding: function () {
      const enc = Object.fromEntries(Object.entries(this.fieldNames)
        .filter(([propName, propValue]) => propValue && propName !== 'mark') // filter not null propname
        .map(([axisName, propValue]) =>
          [axisName, {
            field: propValue,
            type: this.datatypeOf(propValue),
            scale: { zero: false }
          }]
        ));
      if (enc.x && !enc.y) {
        enc.x.bin = true;
        enc.y = { aggregate: 'count' };
        // this.mark = 'bar';
      } else if (enc.y && !enc.x) {
        enc.y.bin = true;
        enc.x = { aggregate: 'count' };
      }
      return enc;
    },
    config: function () {
      const [bgc, fgc, prc] = ['background', 'foreground', 'secondary']
        .map(cname => getComputedStyle(document.body).getPropertyValue('--color-' + cname));
      return {
        background: bgc, // transparent
        group: { fill: fgc },
        symbol: { fill: prc },
        axis: {
          gridColor: fgc,
          labelColor: fgc,
          domainColor: fgc,
          tickColor: fgc,
          titleColor: fgc
        },
        legend: {
          // fillColor: fgc,
          labelColor: fgc
        }
      };
    }
  },
  methods: {
    embed: function () {
      this.data.values = this.values;
      return embed('#vega-container', this);
    },
    datatypeOf: function (propName) {
      console.log(this.fieldTypes[propName], this.fieldTypes[propName] !== undefined);
      if (TEMPORAL_FIELDS.includes(propName)) return 'temporal';
      else if (this.fieldTypes[propName] !== undefined) {
        return Object.values(SpivisService.FIELD)
          .filter((ft) => ft.id === this.fieldTypes[propName])[0].vegaType;
      } else return 'quantitative'; // dim reduced stuff isn't in field-types
    }
  },
  watch: {
    values: function () { this.embed(); },
    fieldNames: {
      handler: function () {
        this.mark = { type: this.fieldNames.mark, tooltip: { content: 'data', size: '10%' } };
        this.embed();
      },
      deep: true
    },
    fieldTypes: function () { this.embed(); }
  }
};
</script>

<style>
canvas {
  box-sizing: border-box;
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
  -ms-box-sizing: border-box;
}
#vega-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
