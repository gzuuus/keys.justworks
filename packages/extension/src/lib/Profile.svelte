<script lang="ts">
  import { onMount } from "svelte";
  import {
    avatarUrl,
    displayName,
    hexColor,
    loadProfiles,
    npubToHex,
    PROFILE_KEY,
    type ProfileEntry,
  } from "./profiles";

  /** Avatar + display name for an npub, falling back to a colored initial +
   *  `fallback` (or nothing). Reads storage only; the SW (or manage page)
   *  refreshes entries and storage.onChanged updates this live. */
  let {
    npub,
    fallback = "",
    size = 28,
  }: { npub: string; fallback?: string; size?: number } = $props();

  let entry = $state<ProfileEntry | null>(null);

  onMount(() => {
    const hex = npubToHex(npub) ?? "";
    void loadProfiles().then((m) => (entry = m[hex] ?? null));
    // Live update: the SW fetches the profile right after unlock; adopt it
    // without reopening the popup.
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const c = changes[PROFILE_KEY];
      if (c) entry = (c.newValue as Record<string, ProfileEntry>)[hex] ?? null;
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  });

  const name = $derived(displayName(entry) ?? (fallback || null));
  const url = $derived(avatarUrl(entry));
</script>

<div class="profile" style="--s: {size}px">
  {#if url}
    <img
      class="ava"
      src={url}
      alt={name ?? "avatar"}
      loading="lazy"
      referrerpolicy="no-referrer"
    />
  {:else}
    <span class="ava fb" style="background-color: {hexColor(npubToHex(npub) ?? npub)}"
      >{(name ?? "#").slice(0, 1).toUpperCase()}</span
    >
  {/if}
  {#if name}<span class="name">{name}</span>{/if}
</div>

<style>
  .profile {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .ava {
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .fb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: calc(var(--s) * 0.42);
    font-weight: 600;
  }
  .name {
    font-weight: 600;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
