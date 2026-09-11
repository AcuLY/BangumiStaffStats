import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue';

export interface ResultRevealOptions {
  focus?: HTMLElement | null;
}

export interface ResultReveal {
  attention: Ref<boolean>;
  clear: () => void;
  reveal: (options?: ResultRevealOptions) => Promise<void>;
  target: Ref<HTMLElement | null>;
}

export function useResultReveal(
  targetWindow: Window = window,
): ResultReveal {
  const target = ref<HTMLElement | null>(null);
  const attention = ref(false);
  let attentionTimer: number | undefined;

  function clear(): void {
    attention.value = false;
    if (attentionTimer !== undefined) {
      targetWindow.clearTimeout(attentionTimer);
      attentionTimer = undefined;
    }
  }

  async function reveal(options: ResultRevealOptions = {}): Promise<void> {
    clear();
    await nextTick();
    const element = target.value;
    if (!element?.isConnected) {
      return;
    }

    const reducedMotion =
      typeof targetWindow.matchMedia === 'function' &&
      targetWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
    attention.value = true;
    element.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
      inline: 'nearest',
    });

    const requestedFocus = options.focus;
    const focusTarget =
      requestedFocus?.isConnected === true ? requestedFocus : element;
    focusTarget.focus({ preventScroll: true });
    attentionTimer = targetWindow.setTimeout(clear, 900);
  }

  onBeforeUnmount(clear);

  return { attention, clear, reveal, target };
}
