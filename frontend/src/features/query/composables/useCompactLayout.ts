import { onBeforeUnmount, onMounted, ref, readonly } from 'vue';

export function useCompactLayout(targetWindow: Window = window) {
  const compact = ref(false);
  let media: MediaQueryList | null = null;

  const update = () => {
    compact.value = media?.matches ?? false;
  };

  onMounted(() => {
    if (typeof targetWindow.matchMedia !== 'function') {
      compact.value = false;
      return;
    }
    media = targetWindow.matchMedia('(width < 780px)');
    update();
    media.addEventListener('change', update);
  });

  onBeforeUnmount(() => {
    media?.removeEventListener('change', update);
  });

  return readonly(compact);
}
