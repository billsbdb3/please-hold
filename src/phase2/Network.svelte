<script lang="ts">
  /**
   * THE NETWORK.
   *
   * Phase 2's centre: a list of their machines and what you can do to each. Every button is a
   * discrete act against a named box with a named outcome, which is the thing four rounds of
   * tuning an attention-allocation model could not produce.
   *
   * Layout follows the control-room research: dense, square, keyboard-reachable, and a machine you
   * have not got onto yet still shows what it is so the map reads as a map.
   */
  import { frame, game, interacted } from '../store.svelte';
  import { fmt } from '../engine/numbers';
  import { viewMachines, takeFoothold, act, networkProgress } from '../engine/intrusion';
  import { MACHINE_BY_ID, type ActionId } from '../data/intrusion';
  import { audio } from '../audio';

  interface Props {
    /** Called after any action, so the parent can flash a result line. */
    onResult?: (line: string) => void;
  }
  const { onResult }: Props = $props();

  const machines = $derived.by(() => { void frame.n; return viewMachines(game); });
  const net = $derived.by(() => { void frame.n; return networkProgress(game.p); });
  const intel = $derived.by(() => { void frame.n; return game.p.intel; });

  /** Which machine's action list is open. One at a time keeps a long list readable. */
  let open = $state<string | null>(null);

  function toggle(id: string) {
    open = open === id ? null : id;
  }

  function foothold(id: string) {
    if (takeFoothold(game, id)) {
      audio.purchase();
      onResult?.(`${MACHINE_BY_ID[id].host} — foothold established.`);
    } else {
      audio.refused();
      onResult?.('Not enough for that yet.');
    }
    interacted();
  }

  function run(id: string, action: ActionId) {
    const r = act(game, id, action);
    interacted();
    if (!r) {
      // Never silent. A refusal is information.
      audio.refused();
      onResult?.('Not yet.');
      return;
    }
    if (r.face) audio.milestone();
    else if (r.escalated) audio.milestone();
    else audio.noteConfirm();
    onResult?.(r.line);
  }
</script>

<div class="net">
  <div class="net-head">
    <span>THEIR NETWORK</span>
    <span class="dim">
      {net.admin} admin · {net.footholds} of {net.known} reached · {net.total} exist
    </span>
  </div>

  <div class="rows">
    {#each machines as m (m.def.id)}
      {@const isOpen = open === m.def.id}
      <div class="machine" class:open={isOpen} class:outside={m.access === 'none'}>
        <button class="machine-head" onclick={() => toggle(m.def.id)}>
          <span class="host">{m.def.host}</span>
          <span class="who">{m.def.who}</span>
          <span class="acc" class:admin={m.access === 'admin'}>
            {m.access === 'admin' ? 'ADMIN' : m.access === 'user' ? 'USER' : '—'}
          </span>
        </button>

        {#if isOpen}
          <p class="note">{m.def.note}</p>

          {#if m.access === 'none'}
            <button
              class="foot"
              onclick={() => foothold(m.def.id)}
              disabled={intel < m.def.footholdCost}
            >
              Get onto it — {fmt(m.def.footholdCost)}
            </button>
          {:else}
            <div class="acts">
              {#each m.available as a (a.def.id)}
                {@const cd = m.cooling[a.def.id] ?? 0}
                <button
                  class="act"
                  onclick={() => run(m.def.id, a.def.id)}
                  disabled={!a.ready}
                  title={a.def.blurb}
                >
                  <span class="act-label">{a.def.label}</span>
                  <span class="act-meta">
                    {#if cd > 0}
                      {Math.ceil(cd)}s
                    {:else if !a.ready}
                      needs admin
                    {:else}
                      +{a.heat.toFixed(1)} susp
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .net {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--edge);
    background: var(--surface);
  }
  .net-head {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 3px 8px;
    border-bottom: 1px solid var(--edge);
    font-size: 9px;
    letter-spacing: 0.14em;
    color: var(--ink-deep);
    flex: 0 0 auto;
  }
  .rows {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--edge) transparent;
  }
  .rows::-webkit-scrollbar { width: 7px; }
  .rows::-webkit-scrollbar-thumb { background: var(--edge); }

  .machine { border-bottom: 1px solid var(--edge); }
  .machine.outside { opacity: 0.7; }
  .machine.open { background: var(--surface-raised); }

  .machine-head {
    display: grid;
    grid-template-columns: 10.5rem 1fr 3.2rem;
    gap: 0.5rem;
    align-items: baseline;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 0;
    padding: 0.35rem 8px;
    font-size: 11px;
  }
  .machine-head:hover { background: var(--surface-raised); }
  .host { color: var(--ink); font-variant-numeric: tabular-nums; }
  .who { color: var(--ink-deep); min-width: 0; }
  .acc {
    text-align: right;
    font-size: 8.5px;
    letter-spacing: 0.1em;
    color: var(--ink-deep);
  }
  .acc.admin { color: var(--green); }

  .note {
    margin: 0;
    padding: 0 8px 0.4rem;
    font-size: 10.5px;
    font-style: italic;
    color: var(--ink-dim);
  }

  .foot,
  .acts {
    margin: 0 8px 0.5rem;
  }
  .foot { width: calc(100% - 16px); }

  .acts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
  }
  .act {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    text-align: left;
    font-size: 10px;
    padding: 3px 5px;
  }
  .act-meta { color: var(--ink-deep); white-space: nowrap; }
</style>
