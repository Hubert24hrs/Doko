import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { subscribeWhenAuthorised } from "@/lib/supabase/realtime";

/**
 * The inbox once subscribed before the session had loaded, joined as anon,
 * and received nothing while showing "Live Delivery". These pin the order that
 * fixes it: session, then realtime auth, then the channel.
 */
function fakeClient(order: string[]) {
  return {
    auth: {
      getSession: vi.fn(async () => {
        order.push("getSession");
        return { data: { session: { access_token: "jwt" } }, error: null };
      }),
    },
    realtime: {
      setAuth: vi.fn(async () => {
        order.push("setAuth");
      }),
    },
  } as unknown as SupabaseClient;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("subscribeWhenAuthorised", () => {
  it("loads the session and authorises realtime BEFORE subscribing", async () => {
    const order: string[] = [];
    subscribeWhenAuthorised(fakeClient(order), () => {
      order.push("subscribe");
      return () => {};
    });
    await flush();
    expect(order).toEqual(["getSession", "setAuth", "subscribe"]);
  });

  it("runs the subscription's own cleanup when stopped", async () => {
    const cleanup = vi.fn();
    const stop = subscribeWhenAuthorised(fakeClient([]), () => cleanup);
    await flush();
    stop();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("never subscribes if stopped while the session is still loading", async () => {
    const start = vi.fn(() => () => {});
    const stop = subscribeWhenAuthorised(fakeClient([]), start);
    stop(); // the component unmounted before getSession resolved
    await flush();
    expect(start).not.toHaveBeenCalled();
  });
});
