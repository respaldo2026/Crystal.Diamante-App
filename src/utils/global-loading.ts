let pendingRequests = 0;

type Listener = (active: boolean, pending: number) => void;

const listeners = new Set<Listener>();

const emit = () => {
  const active = pendingRequests > 0;
  listeners.forEach((listener) => listener(active, pendingRequests));
};

export const startGlobalLoading = () => {
  pendingRequests += 1;
  emit();
};

export const endGlobalLoading = () => {
  pendingRequests = Math.max(0, pendingRequests - 1);
  emit();
};

export const subscribeGlobalLoading = (listener: Listener) => {
  listeners.add(listener);
  listener(pendingRequests > 0, pendingRequests);

  return () => {
    listeners.delete(listener);
  };
};

export const isGlobalLoadingActive = () => pendingRequests > 0;
