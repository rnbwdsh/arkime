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
                <SpivisButton v-for="name in fieldNamesByCategory[currentField.id]" :key="name"
                              :field-value="name.replaceAll(SEP, '.')" :field-name="name"
                              :badge-value="packetFields[name].length" :tooltip="setTooltip"/>
              </b-collapse>
            </b-card-text>
          </template>
        </b-card>
      </b-col>

      <!-- 2nd column: operations -->
      <b-col class="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-6" >
        <FeatureExtraction :packets="packets"
                           :featurePackets.sync="packetsFeatureExtracted"
                           :drop-push="dropPush" :validator="validatorFieldString"/>

        <!-- dimensionality reduction -->
        <DimensionalityReduction :packets="packets" :field-types="fieldTypes"
                                 :values.sync="dimReductionValues"
                                 :drop-push="dropPush" :validator="validatorFieldNumber"/>

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
                        @dblclick="vegaNames[vegaField] = ''"
                        @dragstart="dragStart"
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

        <VegaLiteComponent :fieldNames="vegaNames" :fieldTypes="fieldTypes" :values="packetsVis" />
      </b-col>
    </b-row>
  </div>

</template>

<script>

// import internal
import ConfigService from '../utils/ConfigService';
import MolochError from '../utils/Error';
import MolochSearch from '../search/Search';
import MolochLoading from '../utils/Loading';
import MolochNoResults from '../utils/NoResults';
import FieldService from '../search/FieldService';
import VegaLiteComponent from '../visualizations/VegaLiteComponent';
import MolochPaging from '../utils/Pagination';

// sub-components/services
import SpivisService from './SpivisService';
import FeatureExtraction from './FeatureExtraction';
import DimensionalityReduction from './DimensionalityReduction';
import SpivisButton from './SpivisButton';

let refreshInterval;
let respondedAt; // the time that the last data load successfully responded
let pendingPromise; // save a pending promise to be able to cancel it

export default {
  name: 'Spivis',
  components: {
    SpivisButton,
    DimensionalityReduction,
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
      SEP: SpivisService.SEP,
      FIELD: SpivisService.FIELD, // just to prevent linter errors
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
        this.packetsRaw[idx]));
    },
    packetsVis: function () {
      return this.packets.map((packet, idx) => Object.assign({},
        packet,
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
    packetsVis: function (oldPackets, newPackets) {
      if (!Object.keys(newPackets).length) return;
      oldPackets = Object.entries(oldPackets?.[0]).join('');
      newPackets = Object.entries(newPackets?.[0]).join('');
      if (oldPackets !== newPackets) {
        this.recomputeFields();
      }
    }
  },
  created: function () {
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
    dragStart: function (e) {
      // custom datatype has no default action (unlike text/Plain that behaves like dropping a text file)
      e.dataTransfer.setData('custom', e.target.name);
    },
    dropPush: function (e, targetArrayOrObj, validator) {
      const dragged = e.dataTransfer.getData('custom');
      if (Array.isArray(targetArrayOrObj)) {
        if (validator(dragged)) { targetArrayOrObj.push(dragged); }
      } else {
        targetArrayOrObj[e.target.name] = dragged;
      }
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
    loadPacketsRaw: function () {
      SpivisService.loadPacketsRaw(this.packetsMeta, (x) => { this.packetsRaw = x; }, this.recomputeFields);
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

</style>

<!-- tables are scoped, so scoped styles won't work on them -->
<style>

/* sub components */
.card { padding: 0.5rem; margin-bottom: 0.2rem }
.card-body {padding: 0; }
.card-title {width: 100%;}

</style>
