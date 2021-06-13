<template>
  <div class="spivis-page">
    <b-collapse :visible="true">
        <moloch-search
          :num-matching-sessions="filtered"
          @changeSearch="cancelAndLoad(true)">
          <!-- number of packets selector -->
        <div class="form-group ml-1">
          <b-input-group :append="'of ' + recordsFiltered" prepend="#packets" size="sm">
            <b-select :value="$route.query.length"
                class="form-control"
                @change="cancelAndLoad(true)">
              <b-select-option v-for="num of [10, 100, 1024, 10240, 102400]" :key="num" :value="num">
                {{num | humanReadableBits }}
              </b-select-option>
            </b-select>
          </b-input-group>
        </div>
        </moloch-search> <!-- /search navbar -->
    </b-collapse>

    <b-row class="spivis-content">
      <b-col class="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-6">
      <b-card title="Features">
        <template v-for="currentField of FIELD">
          <b-card-text v-if="fieldTypeCount[currentField.id]" :key="currentField.id">
            <strong v-b-toggle="'coll-' + currentField.id" size="sm">
              <span :class="['fa', currentField.icon]"/> {{currentField.name}}
            </strong>
            <b-collapse :id="'coll-' + currentField.id" :visible="!currentField.hide">
              <template v-for="fieldName in fieldNamesByCategory[currentField.id]">
                <b-button :key="fieldName" :name="fieldName"
                            class="field-button" draggable="true" variant="default"
                            @dragstart="dragstartOriginal" @mouseover="setTooltip" @click.prevent="true">
                    {{fieldName | rawIcon }}
                    <b-badge variant="default" > {{ packetFields[fieldName].length }} </b-badge>
                  </b-button>
              </template>
            </b-collapse>
          </b-card-text>
        </template>
      </b-card>
      </b-col>

      <b-col class="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-6" >
        <b-card>
          <b-card-title> Feature extraction </b-card-title>
          <b-form-tags v-model="statFields"
                       :tag-validator="fieldValidator"
                       placeholder="Enter valid Text [Array]"/>
          <b-button @click="recomputeFields">Calculate</b-button>

          <div>
              <b-table :items="statistics" :responsive="true" small
                       thead-class="statTable" tbody-class="statTable">
                <!-- row label bold, rest to short numbers with K/M postfix -->
                <template #cell()="data"> {{ data.value | humanReadableBits }} </template>
              </b-table>
            </div>
        </b-card>

        <b-card body-class="flex-wrap d-flex" title="Visualization">
          <template v-for="vegaField of Object.keys(names)">
            <b-input-group v-if="vegaField !== 'mark'" :key="vegaField" :prepend="vegaField.slice(0, 4)"
                           class="w-50 flex-nowrap" size="sm">
              <b-button v-model="names[vegaField]" :name="vegaField"
                        class="flex-fill" draggable="true" size="sm" variant="default"
                        @dblclick="names[vegaField] = ''" @dragstart="dragstartField" @drop="drop"
                        @click.prevent @dragenter.prevent @dragover.prevent>
                {{ names[vegaField] }}
              </b-button>
            </b-input-group>
          </template>
          <b-input-group class="w-50" prepend="mark" size="sm">
            <b-form-select v-model="names['mark']" :options="['circle','line','bar','shape']"
                           size="sm" text="mark" variant="default">
            </b-form-select>
          </b-input-group>
        </b-card>
      </b-col>

      <b-col class="col-xl-8 col-lg-6 col-md-6 col-sm-4 col-xs-12">
        <moloch-loading v-if="loading && !error" :can-cancel="true"
            @cancel="cancelAndLoad"/>

        <moloch-error v-if="error" :message="error"
            class="mt-5 mb-5"/>

        <moloch-no-results v-if="!error && !loading && !packets.length"
            :records-total="recordsTotal" :view="query.view"
            class="mt-5 mb-5"/>

        <VegaLiteComponent :fieldNames="names" :types="fieldTypes" :values="packets"/>
      </b-col>
      </b-row>
  </div>

</template>

<script>
// import external
import Vue from 'vue';
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

let refreshInterval;
let respondedAt; // the time that the last data load successfully responded
let pendingPromise; // save a pending promise to be able to cancel it

export default {
  name: 'Spivis',
  components: {
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
      packets: [],
      packetFields: [],
      fields: [],
      rawDataFetched: false,
      fieldTypes: {},
      fieldTypeCount: {},
      names: { x: '', y: '', row: '', column: '', size: '', color: '', shape: '', mark: 'circle' },
      loading: true,
      filtered: 0,
      refresh: 0,
      recordsTotal: 0,
      recordsFiltered: 0,
      statistics: [],
      statFields: [SpivisService.RALL, SpivisService.RSRC, SpivisService.RDST]
    };
  },
  computed: {
    timelineDataFilters: function () {
      const filters = this.$store.state.user.settings.timelineDataFilters;
      return filters.map(i => this.fields.find(f => f.dbField === i));
    },
    showToolBars: function () {
      return this.$store.state.showToolBars;
    },
    query: {
      get: function () {
        return this.$route.query;
      },
      set: function (newValue) {
        this.$router.push({
          query: {
            ...this.$route.query,
            ...newValue
          }
        });
      }
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
  watch: { },
  created: function () {
    this.FIELD = SpivisService.FIELD; // add fields non-reactive
    this.query.length = 100;
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
              if (!this.packets.length) {
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
    drop: function (e) {
      // if we dragged it from a field, empty that field or swap it
      if (this.dragStart) {
        this.names[this.dragStart] = this.names[e.target.name];
      }
      // set name of new field
      this.names[e.target.name] = this.dragged;
    },
    dragstartOriginal: function (e) {
      this.dragged = e.target.name;
      this.dragStart = undefined;
    },
    dragstartField: function (e) {
      this.dragged = e.target.value;
      this.dragStart = e.target.name;
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
    fieldValidator: function (tag) {
      return [SpivisService.FIELD.string.id, SpivisService.FIELD.stringarray.id].includes(this.fieldTypes[tag]);
    },
    /* data loader helper functions -------------------------------------------- */
    recomputeFields: function () {
      SpivisService.deleteStats(this.packets, this.packetFields, this.fieldTypes);
      this.loading = true;
      this.statistics = SpivisService.calculateStatistics(this.packets, this.statFields);
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

      Vue.axios.get('api/sessions', {
        params: {
          ...this.query,
          facets: false,
          flatten: 1,
          excludeFields: 'srcOui,dstOui,fileId,packetPos,fileId'
        }
      }).then((response) => {
        this.recordsFiltered = response.data.recordsFiltered;
        this.packets = response.data.data;
        this.packetFields = SpivisService.extractFields(this.packets);
        SpivisService.loadPacketsRaw(this.packets, this.packetFields, this.recomputeFields);
      })
        .catch((error) => {
          this.error = error;
        });
    }
  },
  filters: {
    rawIcon: function (label) {
      return label.replace(SpivisService.CTR, 'ℕ').replace(SpivisService.STATS, '#');
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
  padding-top: 10px;
}

/* spigraph content styles ------------------- */
/* main graph/map */
.field-button {
  font-size: 75%;
  margin: 5px 5px 0 0;
  padding: 1px 2px;
}

/* modify local scoped bootstrap stuff */
.col {  padding: 2px; }
.card { padding: 0.5rem;}
.card-body {padding: 0; }
.card-title {width: 100%;}

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

<style>
  .statTable > tr > th {
    overflow-wrap: anywhere;
    padding: 1px !important;
    font-size: 70%;
    text-align: center;
  }
  .statTable > tr > td {
    padding: 2px !important;
    text-align: right;
  }
</style>
