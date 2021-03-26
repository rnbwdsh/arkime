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

export default {
  name: 'VegaLiteComponent',
  components: {},
  props: {
    values: Array,
    fieldTypes: Object,
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
        .filter(([_, propName]) => propName)
        .map(([axisName, propName]) =>
          [axisName, {
            field: propName,
            type: this.datatypeOf(propName),
            scale: { zero: false }
          }]
        ));
    },
    config: function () {
      const style = getComputedStyle(document.body);
      const bgc = style.getPropertyValue('--color-background');
      const fgc = style.getPropertyValue('--color-foreground');
      const prc = style.getPropertyValue('--color-primary');
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
      let type = 'ordinal';
      if (this.values && this.values[0] && this.values[0][propName]) {
        const v0 = this.values[0][propName];
        if (typeof v0 === 'number') {
          type = 'quantitative';
          if (v0 > 1000000000000 && v0 < 2000000000000) {
            type = 'temporal';
          }
        }
      }
      return type;
    }
  },
  watch: {
    values: function () { this.embed(); },
    fieldNames: {
      handler: function () { this.embed(); },
      deep: true
    }
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
