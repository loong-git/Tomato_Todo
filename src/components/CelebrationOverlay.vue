<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'done'): void
}>()

const animating = ref(false)

watch(() => props.show, (val) => {
  if (val) {
    animating.value = true
    setTimeout(() => {
      animating.value = false
      emit('done')
    }, 700)
  }
})
</script>

<template>
  <div v-show="animating" class="celebration-overlay">
    <div class="strike-line">
      <div class="pen-tip"></div>
      <div class="line-body"></div>
    </div>
  </div>
</template>

<style scoped>
.celebration-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  display: flex;
  align-items: center;
  padding: 0 10%;
}

.strike-line {
  position: relative;
  width: 0;
  height: 4px;
  animation: strike 0.55s cubic-bezier(0.15, 0.0, 0.35, 1.0) forwards;
}

.line-body {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    rgba(255, 107, 107, 0.1) 0%,
    rgba(255, 107, 107, 0.4) 50%,
    rgba(255, 107, 107, 0.9) 100%
  );
  border-radius: 2px;
}

.pen-tip {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translate(50%, -50%);
  width: 8px;
  height: 8px;
  background: #FF6B6B;
  border-radius: 50%;
  box-shadow:
    0 0 6px 2px rgba(255, 107, 107, 0.8),
    0 0 12px 4px rgba(255, 107, 107, 0.4),
    0 0 20px 8px rgba(255, 107, 107, 0.2);
}

@keyframes strike {
  0% {
    width: 0;
  }
  100% {
    width: 80%;
  }
}
</style>
