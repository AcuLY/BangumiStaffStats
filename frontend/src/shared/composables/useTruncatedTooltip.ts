import { onBeforeUnmount, ref } from 'vue';

export function useTruncatedTooltip() {
  const activeKey = ref<string | null>(null);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function keepOpen(): void {
    clearTimeout(closeTimer);
  }

  function show(key: string, event: Event): void {
    keepOpen();
    const element = event.currentTarget as HTMLElement | null;
    const text = element?.querySelectorAll<HTMLElement>('[data-truncated-text]');
    activeKey.value = text && Array.from(text).some((item) =>
      item.scrollWidth > item.clientWidth + 1 || item.scrollHeight > item.clientHeight + 1,
    ) ? key : null;
  }

  function hide(key: string): void {
    keepOpen();
    if (activeKey.value === key) activeKey.value = null;
  }

  function leave(key: string): void {
    keepOpen();
    closeTimer = setTimeout(() => hide(key), 100);
  }

  onBeforeUnmount(keepOpen);
  return { activeKey, show, hide, leave, keepOpen };
}
