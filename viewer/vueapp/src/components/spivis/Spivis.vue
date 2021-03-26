<template>

  <div class="spigraph-page">
    <b-collapse :visible="true">
        <moloch-search
          :num-matching-sessions="filtered"
          @changeSearch="cancelAndLoad(true)">
          <!-- number of packets selector -->
        <div class="form-group ml-1">
          <b-input-group size="sm" prepend="#packets" :append="'/ ' + recordsFiltered">
            <b-select
                @change="cancelAndLoad(true)"
                class="form-control"
                style="-webkit-appearance: none; -moz-appearance: none;"
                :value="$route.query.length" :options="[10, 100, 1000, 10000]"/>
          </b-input-group>
        </div>
        </moloch-search> <!-- /search navbar -->
    </b-collapse>

    <div class="spigraph-content">
      <div class="row">
      <div class="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-6 column">
      <b-card title="Features" class="smallcard">
        <template v-for="currentField of FIELD">
          <b-card-text :key="currentField.id" v-if="fieldTypeCount[currentField.id]">
            <strong v-b-toggle="'coll-' + currentField.id" size="sm" variant="secondary">
              <span :class="['fa', currentField.icon]"/> {{currentField.name}}
            </strong>
            <b-collapse :id="'coll-' + currentField.id"
                        :visible="currentField.id !== FIELD.single.id"
                        class="fieldCollapse">
              <template v-for="(ele, name) in packetFields">
                  <b-button v-if="fieldTypes[name] === currentField.id"
                            :key="name"
                            :name="name"
                            variant="default"
                            draggable
                            class="field"
                            @click.prevent
                            @mouseover="setTooltip"
                            @dragstart="dragstartOriginal">
                    {{name}}
                    <b-badge variant="default" class="mybadge border">
                      {{ ele.length }}
                    </b-badge>
                  </b-button>
              </template>
            </b-collapse>
          </b-card-text>
        </template>
      </b-card>
      </div>
      <div class="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-6 column" >
        <b-card title="Visualization">
          <template v-for="name of Object.keys(names)">
            <b-input-group :key="name" size="sm" :prepend="`${name}:`">
              <b-button :name="name"
                        v-model="names[name]"
                        class="flex-fill"
                        size="sm"
                        variant="default"
                        draggable
                        @click.prevent
                        @dragenter.prevent
                        @dragover.prevent
                        @dragstart="dragstartField"
                        @drop="drop">
                {{ names[name] }}
              </b-button>
              <b-input-group-append>
                <b-button title="Clear" variant="danger" @click="names[name] = ''">X</b-button>
              </b-input-group-append>
            </b-input-group>
          </template>
        </b-card>
      </div>

      <div class="col-xl-8 col-lg-6 col-md-6 col-sm-4 col-xs-12 column">
        <moloch-loading
            :can-cancel="true"
            v-if="loading && !error"
            @cancel="cancelAndLoad">
        </moloch-loading>

        <moloch-error
            v-if="error"
            :message="error"
            class="mt-5 mb-5">
        </moloch-error>

        <moloch-no-results
            v-if="!error && !loading && !packets.length"
            class="mt-5 mb-5"
            :records-total="recordsTotal"
            :view="query.view">
        </moloch-no-results>

        <VegaLiteComponent
            :mark="vegaMark"
            :types="fieldTypes"
            :fieldNames="names"
            :values="packets"/>
      </div>
      </div>
    </div>
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

let refreshInterval;
let respondedAt; // the time that the last data load succesfully responded
let pendingPromise; // save a pending promise to be able to cancel it

const FIELD = {
  number: { id: 0, icon: 'fa-hashtag', name: 'Number' },
  string: { id: 1, icon: 'fa-text-width', name: 'Text' },
  numberarray: { id: 2, icon: 'fa-list-ol', name: 'Number Array' },
  stringarray: { id: 3, icon: 'fa-list', name: 'Text Array' },
  object: { id: 4, icon: 'fa-list', name: 'Array' },
  single: { id: 5, icon: 'fa-check', name: 'Single' },
  other: { id: 6, icon: 'fa-bar-chart', name: 'Other' }
};

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
      error: '',
      packets: [],
      packetFields: [],
      fields: [],
      fieldTypes: {},
      fieldTypeCount: {},
      names: { x: '', y: '', row: '', column: '', size: '', color: '' },
      loading: true,
      filtered: 0,
      refresh: 0,
      recordsTotal: 0,
      recordsFiltered: 0,
      vegaMark: {}
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
    }
  },
  watch: { },
  created: function () {
    this.FIELD = FIELD; // add fields non-reactive
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
     * @param {bool} runNewQuery  Whether to run a new spigraph query after
     *                            canceling the request
     */
    cancelAndLoad: function (runNewQuery) {
      if (pendingPromise) {
        ConfigService.cancelEsTask(pendingPromise.cancelId)
          .then((response) => {
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
          if (respondedAt && Date.now() - respondedAt >= parseInt(this.refresh * 1000)) {
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
      e.target.title = data.length > 100 ? data.slice(0, 100) + '...' : data;
    },
    /* helper functions ---------------------------------------------------- */
    extractFields: function (items) {
      const fields = {};
      for (const item of items) {
        for (const [key, value] of Object.entries(item)) {
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
    extractFieldTypes: (fields) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, values]) => {
          if (values.length <= 1) {
            return [key, FIELD.single.id];
          } else if (values.every((v) => typeof values[0] === typeof v)) {
            return [key, FIELD[typeof values[0]].id];
          } else {
            return [key, FIELD.other.id];
          }
        })),
    fixFields: function (itemFields, fieldTypes) {
      const fieldCount = {};
      for (let [title, type] of Object.entries(fieldTypes)) {
        if (type === FIELD.object.id) {
          if (itemFields[title].every((v) => v.length === 1)) {
            fieldTypes[title] = FIELD[typeof itemFields[title][0][0]].id;
            itemFields[title] = itemFields[title].map((v) => v[0]).sort();
            for (const item of this.packets) {
              if (item[title]) {
                item[title] = item[title].map((v) => v[0]);
              }
            }
          } else {
            const typeName = (typeof itemFields[title][0][0]) + 'array';
            fieldTypes[title] = FIELD[typeName].id;
          }
        }
        type = fieldTypes[title];
        if (!fieldCount[type]) { fieldCount[type] = 0; }
        fieldCount[type]++;
      }
      this.fieldTypeCount = fieldCount;
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
          excludeFields: 'srcOui,dstOui,fileId,packetPos'
        }
      }).then((response) => {
        this.recordsFiltered = response.data.recordsFiltered;
        this.packets = response.data.data;
        this.packetFields = this.extractFields(this.packets);
        const fieldTypes = this.extractFieldTypes(this.packetFields);
        this.fixFields(this.packetFields, fieldTypes);
        this.fieldTypes = fieldTypes;
        this.error = '';
        this.loading = false;
      })
        .catch((error) => {
          this.error = error;
        });
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

.spigraph-page form.spigraph-form {
  z-index: 4;
  background-color: var(--color-quaternary-lightest);
}
.spigraph-page form.spigraph-form .form-inline {
  flex-flow: row nowrap;
}
.spigraph-page form.spigraph-form select.form-control {
  -webkit-appearance: none;
}
.spigraph-page form.spigraph-form .form-inline .records-display  {
  line-height: 0.95;
  font-size: 12px;
  font-weight: 400;
}

/* field typeahead */
.spigraph-page form.spigraph-form .field-typeahead {
  max-height: 300px;
  overflow-y: auto;
}

/* spigraph content styles ------------------- */
.spigraph-page .spigraph-content {
  padding-top: 10px;
}

.spigraph-page .spi-graph-item .spi-bucket sup {
  margin-left: -12px;
}

/* spigraph content styles ------------------- */
/* main graph/map */
.field {
  font-size: 75%;
  margin: 6px 6px 0 0;
  padding: 1px 2px;
}

.mybadge {
  top: unset;
  position: absolute;
  transform: translate(-50%, -75%);
  font-size: 80%;
  padding: 0.2em 0.2em 0 0.2em;
}

.column {
  padding-left: 3px;
  padding-right: 3px;
}

.row {margin: 0;}
smallcard { padding: 1rem 0.75rem;}

</style>
