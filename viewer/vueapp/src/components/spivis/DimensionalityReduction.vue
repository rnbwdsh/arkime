<template>
  <b-card title="Dimensionality reduction"
          @drop="dropPush($event, fields, validator)"
          @dragenter.prevent @dragover.prevent>
    <b-input-group prepend="Method">
      <b-select :value="select"
                :options="['UMAP', 'TSNE', 'TriMap', 'PCA', 'LLE', 'LTSA', 'ISOMAP', 'FASTMAP','MDS', 'LSP', 'LDA', 'TopoMap', 'SAMMON']"/>
    </b-input-group>
    <b-form v-for="druidParam in Object.keys(params)" :key="druidParam">
      <b-input-group :prepend="druidParam">
        <b-input placeholder="default"/>
      </b-input-group>
    </b-form>

    <b-form-tags :value="fields"
                 placeholder="Enter valid Number fields"
                 remove-on-delete
                 tag-class="btn btn-default"
                 @input="addWildcard"
                 @tag-state="tagState"/>
    <ul v-if="autocomplete.length" class="dropdown-menu show">
      <b-dropdown-item v-for="option of autocomplete"
                       :key="option"
                       @click="click(option)">
        {{ option.replaceAll(SEP, '.') }}
      </b-dropdown-item>
    </ul>

    <br/>
    <template v-if="values && values[0]">
      <SpivisButton v-for="fieldName in Object.keys(values[0])"
                    :key="fieldName"
                    :field-name="fieldName"/>
    </template>
  </b-card>
</template>
<script>
import SpivisService from './SpivisService';
import * as druid from '@saehrimnir/druidjs';
import SpivisButton from './SpivisButton';

export default {
  name: 'DimensionalityReduction',
  components: { SpivisButton },
  props: {
    packets: {},
    fieldTypes: {},
    values: {}, // sync: will emit writing event
    dropPush: {},
    validator: {}
  },
  data: function () {
    return {
      SEP: SpivisService.SEP,
      select: 'PCA',
      params: {},
      fields: [],
      autocomplete: []
    };
  },
  watch: {
    select: function () {
      const druidMethod = new druid[this.select]([[1]]);
      const paramList = druidMethod.parameter_list || [];
      this.params = Object.fromEntries(paramList.map((k) => [k, []]));
      this.reduce(this.select, this.fields, this.params);
    },
    fields: function () {
      this.reduce(this.select, this.fields, this.params);
    },
    packets: function (oldPackets, newPackets) {
      if (!Object.keys(newPackets).length) return;
      oldPackets = Object.entries(oldPackets?.[0]).join('');
      newPackets = Object.entries(newPackets?.[0]).join('');
      if (oldPackets !== newPackets) {
        this.reduce(this.select, this.fields, this.params);
      }
    }
  },
  methods: {
    reduce: function (select, fields, params) {
      let values = [];
      if (fields.length >= 2) {
        const data = this.packets
          .map((packet) => fields
            .map((field) => packet[field] || 0));
        const DR = new druid[select](data, ...Object.values(params));
        values = DR.transform().map((p) => Object.fromEntries([...p] // Float64 array to regular array
          .map((val, idx) => ['dim' + idx, val])));
      }
      this.$emit('update:values', values);
    },
    addWildcard: function () {
      if (this.autocomplete) {
        const invalid = this.fields.filter((p) => !this.validator(p))[0];
        const tmp = this.fields.concat(this.autocomplete);
        this.autocomplete = [];
        this.fields = tmp.filter((p) => p !== invalid);
      }
    },
    click: function (option) {
      this.autocomplete.splice(this.autocomplete.indexOf(option));
      this.fields.push(option);
    },
    tagState: function (valid, invalid, duplicate) {
      const complete = [...valid, ...invalid, ...duplicate][0];
      if (!complete) this.autocomplete = [];
      else {
        this.autocomplete = Object.keys(this.fieldTypes)
          .filter(this.validator)
          .filter((fn) => !this.fields.includes(fn))
          .filter((fn) => (fn.replaceAll(SpivisService.SEP, '')
            .toLowerCase().includes(complete.toLowerCase())))
          .sort();
      }
    }
  }
};
</script>
<style>
.dropdown-menu {
  top: inherit;
  margin-right: 1em;
}

/* sub components */
</style>
