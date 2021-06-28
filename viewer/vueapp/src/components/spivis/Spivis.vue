<template>
  <div class="spivis-page">
    <b-collapse :visible="true">
      <moloch-search
          :num-matching-sessions="filtered"
          @changeSearch="cancelAndLoad(true)">
        <!-- number of packets selector -->
        <moloch-paging
            :compact="true"
            :length-default=100
            :records-filtered="recordsFiltered"
            :records-total="recordsTotal"
            class="form-group ml-1"
            prepend="Page"
            @changePaging="cancelAndLoad(true)">
        </moloch-paging>
      </moloch-search> <!-- /search navbar -->
    </b-collapse>

    <b-row class="spivis-content">
      <!-- 1st column: data fields -->
      <b-col class="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-6">
        <b-card title="Features">
          <template v-for="currentField of FIELD">
            <b-card-text v-if="fieldTypeCount[currentField.id]" :key="currentField.id">
              <strong v-b-toggle="'coll-' + currentField.id" size="sm">
                <span :class="['fa', currentField.icon]"/> {{currentField.name}}
              </strong>
              <b-collapse :id="'coll-' + currentField.id" :visible="!currentField.hide">
                <template v-for="fieldName in fieldNamesByCategory[currentField.id]"  >
                  <b-button :key="fieldName" :name="fieldName"
                            class="field-button" draggable="true" variant="default"
                            @dragstart="dragStart" @mouseover="setTooltip" @click.prevent>
                    {{fieldName | shortName }}
                    <b-badge variant="default" > {{ packetFields[fieldName].length }} </b-badge>
                  </b-button>
                </template>
              </b-collapse>
            </b-card-text>
          </template>
        </b-card>
      </b-col>

      <!-- 2nd column: operations -->
      <b-col class="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-6" >
        <FeatureExtraction :packets="packets" :featurePackets.sync="packetsFeatureExtracted"
                           :drop-push="dropPush" :validator="validatorFieldString"/>

        <!-- dimensionality reduction -->
        <b-card title="Dimensionality reduction"
                @drop="dropPush($event, dimReductionFields, validatorFieldNumber)"
                @dragenter.prevent @dragover.prevent>
          <b-input-group prepend="Method">
            <b-select v-model="dimReductionSelect" :options="['UMAP', 'TSNE', 'TriMap', 'PCA', 'LLE', 'LTSA', 'ISOMAP', 'FASTMAP','MDS', 'LSP', 'LDA', 'TopoMap', 'SAMMON']"/>
          </b-input-group>
          <b-form v-for="druidParam in Object.keys(dimReductionParams)" :key="druidParam">
            <b-input-group :prepend="druidParam">
              <b-input placeholder="default"/>
            </b-input-group>
          </b-form>

          <b-form-tags v-model="dimReductionFields"
                       placeholder="Enter valid Number fields"
                       remove-on-delete
                       tag-class="btn btn-default"
                       @input="addWildcard"
                       @tag-state="dimReductionTagState"/>
            <ul v-if="dimReductionTagStateAutocomplete.length"  class="dropdown-menu show">
              <b-dropdown-item v-for="option of dimReductionTagStateAutocomplete"
                               :key="option"
                               @click="dimReductionClick(option)">
                  {{ option | shortName }}
              </b-dropdown-item>
            </ul>
        </b-card>

        <!-- clustering block -->
        <b-card title="Clustering & Outliers"
                @drop="dropPush($event, clusterFields, validatorFieldNumber)"
                @dragenter.prevent @dragover.prevent>
          <b-input-group prepend="Method">
            <b-select v-model="clusterSelect" :options="['KNN']"/>
          </b-input-group>
          <b-input-group>
            <b-form-tags v-model="clusterFields"
                         :validate="validatorFieldNumber"
                         remove-on-delete
                         tag-class="btn btn-default"
                         placeholder="Enter valid Number fields"/>
          </b-input-group>
        </b-card>

        <!-- visualization block -->
        <b-card title="Visualization" >
          <b-card-body class="flex-wrap d-flex">
            <b-input-group v-for="vegaField of vegaNamesKeysWithoutMark" :key="vegaField" :prepend="vegaField.slice(0, 4)"
                           class="w-50 flex-nowrap" size="sm">
              <b-button v-model="vegaNames[vegaField]" :name="vegaField"
                        class="flex-fill" draggable="true" size="sm" variant="default"
                        @drop="dropPush($event, vegaNames, null)"
                        @dblclick="vegaNames[vegaField] = ''" @dragstart="dragStart"
                        @click.prevent @dragenter.prevent @dragover.prevent>
                {{ vegaNames[vegaField] }}
              </b-button>
            </b-input-group>
            <b-input-group class="w-50" prepend="mark" size="sm">
              <b-form-select v-model="vegaNames['mark']" :options="['circle','line','bar','shape']"
                             size="sm" text="mark" variant="default" @focus.prevent>
              </b-form-select>
            </b-input-group>
          </b-card-body>
        </b-card>
      </b-col>

      <b-col class="col-xl-8 col-lg-6 col-md-6 col-sm-4 col-xs-12">
        <moloch-loading v-if="loading && !error" :can-cancel="true"
                        @cancel="cancelAndLoad"/>

        <moloch-error v-if="error" :message="error"
                      class="mt-5 mb-5"/>

        <moloch-no-results v-if="!error && !loading && !packets.length"
                           :records-total="recordsTotal" :view="$route.query.view"
                           class="mt-5 mb-5"/>

        <VegaLiteComponent :fieldNames="vegaNames" :fieldTypes="fieldTypes" :values="packets" />
      </b-col>
    </b-row>
  </div>

</template>

<script>

// Custom external libaries
import * as druid from '@saehrimnir/druidjs';
// import services
import ConfigService from '../utils/ConfigService';
// import internal
import MolochError from '../utils/Error';
import MolochSearch from '../search/Search';
import MolochLoading from '../utils/Loading';
import MolochNoResults from '../utils/NoResults';
import FieldService from '../search/FieldService';
import VegaLiteComponent from '../visualizations/VegaLiteComponent';
import SpivisService from './SpivisService';
import MolochPaging from '../utils/Pagination';

// special tags input
import Vue from 'vue';
import VoerroTagsInput from '@voerro/vue-tagsinput';
import FeatureExtraction from './FeatureExtraction';

Vue.component('tags-input', VoerroTagsInput);

let refreshInterval;
let respondedAt; // the time that the last data load successfully responded
let pendingPromise; // save a pending promise to be able to cancel it

export default {
  name: 'Spivis',
  components: {
    FeatureExtraction,
    MolochPaging,
    VegaLiteComponent,
    MolochError,
    MolochSearch,
    MolochLoading,
    MolochNoResults
  },
  data: function () {
    return {
      FIELD: [], // just to prevent linter errors
      error: '',
      fields: [],
      vegaNames: { x: '', y: '', row: '', column: '', size: '', color: '', shape: '', mark: 'circle' },
      loading: true,
      filtered: 0,
      refresh: 0,
      recordsTotal: 0,
      recordsFiltered: 0,

      // full packets object list is composed from
      packetsMeta: [],
      packetsRaw: [],
      packetsFeatureExtracted: [],

      packetFields: [],
      fieldTypes: {},
      fieldTypeCount: {},

      // dimensionality reduction data
      dimReductionSelect: 'PCA',
      dimReductionParams: {},
      dimReductionFields: [],
      dimReductionTagStateAutocomplete: [],
      dimReductionValues: [],

      clusterFields: [],
      clusterSelect: 'KNN',
      clusterFieldsAutocomplete: []
    };
  },
  computed: {
    packets: function () {
      return this.packetsMeta.map((packet, idx) => Object.assign({},
        packet,
        this.packetsRaw[idx],
        this.packetsFeatureExtracted[idx],
        this.dimReductionValues[idx]));
    },
    vegaNamesKeysWithoutMark: function () {
      return Object.keys(this.vegaNames).filter((vegaField) => vegaField !== 'mark');
    },
    timelineDataFilters: function () {
      const filters = this.$store.state.user.settings.timelineDataFilters;
      return filters.map(i => this.fields.find(f => f.dbField === i));
    },
    showToolBars: function () {
      return this.$store.state.showToolBars;
    },
    fieldNamesByCategory: function () {
      const fnc = {};
      for (const [nam, id] of Object.entries(this.fieldTypes)) {
        if (!fnc[id]) { fnc[id] = []; }
        fnc[id].push(nam);
      }
      return fnc;
    }
  },
  watch: {
    packets: function (oldPackets, newPackets) {
      if (!Object.keys(newPackets).length) return;
      oldPackets = Object.entries(oldPackets?.[0]).join('');
      newPackets = Object.entries(newPackets?.[0]).join('');
      if (oldPackets !== newPackets) {
        this.recomputeFields();
      }
    },
    dimReductionSelect: function () {
      const druidMethod = new druid[this.dimReductionSelect]([[1]]);
      const paramList = druidMethod.parameter_list || [];
      this.dimReductionParams = Object.fromEntries(paramList.map((k) => [k, []]));
      this.dimReduction();
    },
    dimReductionFields: function () { this.dimReduction(); }
  },
  created: function () {
    this.FIELD = SpivisService.FIELD; // add fields non-reactive
    FieldService.get(true)
      .then((result) => {
        this.fields = result;
        this.fields.push({
          dbField: 'ip.dst:port',
          exp: 'ip.dst:port',
          help: 'Destination IP:Destination Port',
          group: 'general',
          friendlyName: 'Dst IP:Dst Port'
        });
      }).catch((error) => {
      // this.loading = false;
        this.error = error.text || error;
      });

    setTimeout(() => {
      // wait for query to be computed
      this.cancelAndLoad(true);
      this.changeRefreshInterval();
    });
  },
  methods: {
    /* exposed page functions ---------------------------------------------- */
    /**
     * Cancels the pending session query (if it's still pending) and runs a new
     * query if requested
     * @param {boolean} runNewQuery  Whether to run a new spigraph query after
     *                            canceling the request
     */
    cancelAndLoad: function (runNewQuery) {
      if (pendingPromise) {
        ConfigService.cancelEsTask(pendingPromise.cancelId)
          .then((_) => {
            if (pendingPromise) {
              pendingPromise.source.cancel();
              pendingPromise = null;
            }

            if (!runNewQuery) {
              this.loading = false;
              if (!this.packetsMeta.length) {
                // show a page error if there is no data on the page
                this.error = 'You canceled the search';
              }
              return;
            }
            this.loadPackets();
          });
      } else if (runNewQuery) {
        this.loadPackets();
      }
    },
    changeRefreshInterval: function () {
      if (refreshInterval) { clearInterval(refreshInterval); }

      if (this.refresh && this.refresh > 0) {
        this.$store.commit('setIssueSearch', true);
        refreshInterval = setInterval(() => {
          if (respondedAt && Date.now() - respondedAt >= parseInt(this.refresh) * 1000) {
            this.$store.commit('setIssueSearch', true);
          }
        }, 500);
      }
    },
    /* event functions ----------------------------------------------------- */
    dimReductionTagState: function (valid, invalid, duplicate) {
      const complete = [...valid, ...invalid, ...duplicate][0];
      if (!complete) this.dimReductionTagStateAutocomplete = [];
      else {
        this.dimReductionTagStateAutocomplete = Object.keys(this.fieldTypes)
          .filter(this.validatorFieldNumber)
          .filter((fn) => !this.dimReductionFields.includes(fn))
          .filter((fn) => (fn.replaceAll(SpivisService.SEP, '')
            .toLowerCase().includes(complete.toLowerCase())))
          .sort();
      }
    },
    dimReductionClick: function (option) {
      this.dimReductionFields.push(option);
      this.dimReductionTagStateAutocomplete.splice(this.dimReductionTagStateAutocomplete.indexOf(option));
    },
    addWildcard: function () {
      if (this.dimReductionTagStateAutocomplete) {
        const invalid = this.dimReductionFields.filter((p) => !this.validatorFieldNumber(p))[0];
        const tmp = this.dimReductionFields.concat(this.dimReductionTagStateAutocomplete);
        this.dimReductionTagStateAutocomplete = [];
        this.dimReductionFields = tmp.filter((p) => p !== invalid);
      }
    },
    dropPush: function (e, targetArrayOrObj, validator) {
      const dragged = e.dataTransfer.getData('custom');
      if (Array.isArray(targetArrayOrObj)) {
        if (validator(dragged)) { targetArrayOrObj.push(dragged); }
      } else {
        targetArrayOrObj[e.target.name] = dragged;
      }
    },
    dragStart: function (e) {
      // custom datatype has no default action (unlike text/Plain that behaves like dropping a text file)
      e.dataTransfer.setData('custom', e.target.name);
    },
    setTooltip: function (e) {
      let data = this.packetFields[e.target.name];
      if (!data) return;
      data = data.slice(0, 30).join(', ');
      if (e.target.name.includes(SpivisService.RANY)) {
        data = e.target.name + ': ' + data;
      }
      e.target.title = data.length > 100 ? data.slice(0, 100) + '...' : data;
    },
    validatorFieldString: function (tag) {
      return [SpivisService.FIELD.string.id, SpivisService.FIELD.stringarray.id].includes(this.fieldTypes[tag]);
    },
    validatorFieldNumber: function (tag) {
      return this.fieldTypes[tag] === SpivisService.FIELD.number.id;
    },
    /* data loader helper functions -------------------------------------------- */
    recomputeFields: function () {
      this.packetFields = SpivisService.extractFields(this.packets);
      this.fieldTypes = SpivisService.extractFieldTypes(this.packetFields);
      this.fieldTypeCount = SpivisService.fixFields(this.packetFields, this.fieldTypes, this.packets);
      this.error = '';
      this.loading = false;
    },
    loadPackets: function () {
      respondedAt = undefined;
      this.loading = true;
      this.error = false;

      SpivisService.loadPackets(this.$route.query).then((response) => {
        this.recordsFiltered = response.data.recordsFiltered;
        // replace underscores with dots, for vega to work
        this.packetsMeta = response.data.data.map((p) =>
          Object.fromEntries(Object.entries(p).map(
            ([k, v]) => [k.replaceAll('.', SpivisService.SEP), v])));
        this.loadPacketsRaw();
      })
        .catch((error) => {
          this.error = error;
        });
    },
    loadPacketsRaw: async function () {
      this.packetsRaw = await SpivisService.loadPacketsRaw(this.packetsMeta);
      this.recomputeFields();
    },
    dimReduction: function () {
      if (this.dimReductionFields.length > 2) {
        const data = this.packets
          .map((packet) => this.dimReductionFields
            .map((field) => packet[field] || 0));
        const DR = new druid[this.dimReductionSelect](data, ...Object.values(this.dimReductionParams));
        this.dimReductionValues = DR.transform().map((p) => Object.fromEntries([...p] // Float64 array to regular array
          .map((val, idx) => ['dim' + idx, val])));
      } else {
        this.dimReductionValues = [];
      }
    }
  },
  filters: {
    shortName: function (label) {
      return label.replaceAll(SpivisService.SEP, '.');
    }
  },
  beforeDestroy: function () {
    if (pendingPromise) {
      pendingPromise.source.cancel();
      pendingPromise = null;
    }
  }
};
</script>

<style scoped>
/* spivis content styles ------------------- */
.spivis-page .spivis-content {
  margin: 0;
  padding-top: 0.1rem;
}

/* spigraph content styles ------------------- */
/* main graph/map */
.field-button {
  font-size: 75%;
  margin: 5px 5px 0 0;
  padding: 1px 2px;
}

.badge {
  top: unset;
  position: absolute;
  transform: translate(-50%, -75%);
  font-size: 80%;
  padding: 0.2em 0.2em 0 0.2em;
  background-color: var(--color-background);
  border: 1px solid #ced4da;
}
.custom-select {
  border: 1px solid #ced4da;
}

</style>

<!-- tables are scoped, so scoped styles won't work on them -->
<style>
.dropdown-menu {
  top: inherit;
}

/* sub components */
.card { padding: 0.5rem; margin-bottom: 0.2rem }
.card-body {padding: 0; }
.card-title {width: 100%;}
</style>
