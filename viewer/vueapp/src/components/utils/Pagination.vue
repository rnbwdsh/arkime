<template>

  <b-input-group size="sm">
    <b-input-group-prepend v-if="prepend">
      <b-input-group-text>
        {{ prepend }}
      </b-input-group-text>
    </b-input-group-prepend>
    <template v-if="!infoOnly">
      <!-- page size -->
      <b-select class="page-select" size="sm" v-model="length" :options="lengthOptions"/>
      <!-- paging -->
      <b-pagination size="sm"
        v-model="currentPage"
        :limit="5"
        hide-ellipsis
        :per-page="length"
        :total-rows="recordsFiltered"
        @input="notifyParent(true)">
      </b-pagination> <!-- paging -->
      <!-- page info -->
      <div class="pagination-info cursor-help"
        v-b-tooltip.hover.right="pagingInfoTitle">
        <span v-if="!compact">Showing</span>
        <span v-if="recordsFiltered">
          {{ start + 1 }}
        </span>
        <span v-else>
          {{ start }}
        </span>
        <span v-if="recordsFiltered">
          - {{ Math.min((start + length), recordsFiltered) }}
        </span>
        of {{ recordsFiltered | commaString }}
        <span v-if="!compact">entries</span>
      </div> <!-- /page info -->
    </template>
    <template v-else
      class="pagination-info info-only">
      Showing {{ recordsFiltered | commaString }} entries,
      filtered from {{ recordsTotal }} total entries
    </template>
  </b-input-group>

</template>

<script>
export default {
  name: 'MolochPaging',
  props: {
    recordsTotal: Number,
    recordsFiltered: Number,
    lengthDefault: Number,
    infoOnly: Boolean,
    compact: Boolean,
    prepend: String
  },
  data: function () {
    return {
      start: 0,
      currentPage: 1
    };
  },
  computed: {
    length: {
      get: function () {
        // only allow a maximum of 1000
        return Math.min(parseInt(this.$route.query.length || this.lengthDefault || 50), 1000);
      },
      set: function (newValue) {
        if (newValue !== this.length) {
          const newQuery = {
            ...this.$route.query,
            length: newValue
          };

          const exprChanged = this.$store.state.expression !== this.$route.query.expression;
          if (exprChanged) {
            newQuery.expression = this.$store.state.expression;
          }

          this.$router.push({ query: newQuery });

          // only issue a new query if the expression hasn't changed. if it
          // has changed, a query will be issued by ExpressionTypeahead.vue
          this.notifyParent(!exprChanged);
        }
      }
    },
    lengthOptions: function () {
      const options = [10, 50, 100, 200, 500, 1000].map((nr) => {
        return { value: nr, text: this.compact ? nr : `${nr} per page` };
      });

      let exists = false;
      for (const option of options) {
        if (this.length === option.value) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        options.push({
          value: this.length,
          label: `${this.length} per page`
        });
      }

      options.sort(function (a, b) {
        return a.value - b.value;
      });

      return options;
    },
    pagingInfoTitle: function () {
      const total = this.$options.filters.commaString(this.recordsTotal);
      return `filtered from ${total} total entries`;
    }
  },
  methods: {
    notifyParent: function (issueQuery) {
      this.start = (this.currentPage - 1) * this.length;

      const pagingParams = {
        start: this.start,
        length: this.length,
        issueQuery: issueQuery
      };

      this.$emit('changePaging', pagingParams);
    }
  }
};
</script>

<style scoped>

.pagination-info {
  display: inline-block;
  font-size: .8rem;
  color: var(--color-gray-dark);
  border: 1px solid var(--color-gray-light);
  padding: 5px 10px;
  border-radius: 0 var(--px-sm) var(--px-sm) 0;
  background-color: var(--color-white);
}

.page-select {
  border-right: none;
}

.pagination {
  margin-bottom: 0;
}
</style>
