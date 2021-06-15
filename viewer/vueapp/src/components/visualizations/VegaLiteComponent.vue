<template>
  <div id="vis" class="full">
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
      data: { values: [] } // pre-init valid
    };
  },
  computed: {
    encoding: function () {
      return Object.fromEntries(Object.entries(this.fieldNames)
        .filter(([propName, propValue]) => propValue && propName !== 'mark') // filter not null propname
        .map(([axisName, propValue]) =>
          [axisName, {
            field: propValue,
            type: this.datatypeOf(propValue),
            scale: { zero: false }
          }]
        ));
    },
    config: function () {
      const [bgc, fgc, prc] = ['background', 'foreground', 'primary']
        .map(cname => getComputedStyle(document.body).getPropertyValue('--color-' + cname));
      return {
        resize: true,
        autosize: {
          type: 'fit',
          contains: 'padding'
        },
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
      return embed('#vis', this);
    },
    datatypeOf: function (propName) {
      return TEMPORAL_FIELDS.includes(propName)
        ? 'temporal'
        : Object.values(SpivisService.FIELD)
          .filter((ft) => ft.id === this.fieldTypes[propName])[0].vegaType;
    }
  },
  watch: {
    values: function () { this.embed(); },
    fieldNames: {
      handler: function () {
        this.mark = this.fieldNames.mark;
        this.embed();
      },
      deep: true
    },
    fieldTypes: function () { this.embed(); }
  }
};
</script>

<style scoped>
canvas,
.full {
  width: 100%;
  height: 100%;
}
</style>
