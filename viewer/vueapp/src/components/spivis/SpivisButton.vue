<template>
  <b-button :name="fieldName"
            class="field-button" draggable="true" variant="default"
            @click.prevent @mouseover="tooltip"
            @dragstart="e.dataTransfer.setData('custom', e.target.name);">
    {{fieldValue.replaceAll(SEP, ".") }}
    <b-badge v-if="badgeValue" variant="default" > {{ badgeValue }} </b-badge>
  </b-button>
</template>
<script>
import SpivisService from './SpivisService';

export default {
  name: 'SpivisButton',
  props: {
    fieldName: {},
    fieldValue: { default: () => this.fieldName },
    badgeValue: { default: null },
    tooltip: { default: () => function () {} }
  },
  data: function () {
    return {
      SEP: SpivisService.SEP
    };
  },
  methods: {
    dragStart: function (e) {
      e.dataTransfer.setData('custom', e.target.name);
    }
  }
};
</script>
<style scoped>
.badge {
  top: unset;
  position: absolute;
  transform: translate(-50%, -75%);
  font-size: 80%;
  padding: 0.2em 0.2em 0 0.2em;
  background-color: var(--color-background);
  border: 1px solid #ced4da;
}

.field-button {
  font-size: 75%;
  margin: 0.5em 0.5em 0 0;
  padding: 0.1em 0.2em;
}
</style>
