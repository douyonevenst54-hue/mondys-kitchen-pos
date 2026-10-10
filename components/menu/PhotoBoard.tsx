"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, ImageOff, Search, Tag, Trash2 } from "lucide-react";
import { resizePhoto } from "@/lib/resize-photo";

type Dish = { id: string; name: string; number: number | null; imageUrl: string | null; hidden: boolean };
type Category = { id: string; name: string; items: Dish[] };
type Filter = "menu" | "missing" | "hidden";

const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-mondy-red/50";

export function PhotoBoard({ categories }: { categories: Category[] }) {
  const [photos, setPhotos] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(categories.flatMap((c) => c.items.map((i) => [i.id, i.imageUrl]))),
  );
  const [filter, setFilter] = useState<Filter>("menu");
  const [query, setQuery] = useState("");

  const onMenu = categories.flatMap((c) => c.items).filter((i) => !i.hidden);
  const missing = onMenu.filter((i) => !photos[i.id]).length;

  // Dishes missing a photo when the page opened stay in that list after you add one.
  const [missingAtOpen] = useState(() => new Set(onMenu.filter((i) => !i.imageUrl).map((i) => i.id)));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => {
          if (q && !i.name.toLowerCase().includes(q) && String(i.number ?? "") !== q) return false;
          if (filter === "hidden") return i.hidden;
          if (i.hidden) return false;
          return filter === "missing" ? missingAtOpen.has(i.id) || !photos[i.id] : true;
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, filter, query, photos, missingAtOpen]);

  return (
    <main className="min-h-screen bg-mondy-cream font-sans text-mondy-ink">
      <header className="sticky top-0 z-10 border-b border-mondy-border bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className={`flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to register
            </Link>
            <Link
              href="/menu/prices"
              className={`flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium ring-1 ring-mondy-border transition hover:bg-mondy-cream ${ring}`}
            >
              <Tag className="h-3.5 w-3.5" aria-hidden />
              Prices
            </Link>
          </div>
          <div>
            <h1 className="font-display text-2xl font-black">Dish photos</h1>
            <p className="mt-0.5 text-sm text-mondy-muted" aria-live="polite">
              Tap a dish to take a photo or pick one from the device. It shows on the online menu right away.
              {missing > 0
                ? ` ${missing} ${missing === 1 ? "dish on the menu has" : "dishes on the menu have"} no photo yet.`
                : " Every dish on the menu has a photo."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mondy-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a dish or number"
                aria-label="Search"
                className="h-10 w-full rounded-xl bg-mondy-cream pl-9 pr-3 text-sm placeholder:text-mondy-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
              />
            </div>
            <div role="group" aria-label="Show" className="flex rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
              {(
                [
                  ["menu", "On the menu"],
                  ["missing", `No photo (${missing})`],
                  ["hidden", "Hidden"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${ring} ${
                    filter === value ? "bg-white shadow-sm" : "text-mondy-muted hover:text-mondy-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-16 pt-2 sm:px-6">
        {visible.length === 0 && (
          <p className="py-16 text-center text-sm text-mondy-muted">
            {filter === "missing" && !query ? "Every dish on the menu has a photo." : "No dishes match."}
          </p>
        )}
        {visible.map((c) => (
          <section key={c.id} className="mt-6">
            <h2 className="mb-3 border-b border-mondy-red pb-1.5 font-display text-base font-black uppercase tracking-wide text-mondy-red">
              {c.name}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {c.items.map((i) => (
                <PhotoTile
                  key={i.id}
                  dish={i}
                  url={photos[i.id]}
                  onChange={(url) => setPhotos((p) => ({ ...p, [i.id]: url }))}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

function PhotoTile({ dish, url, onChange }: { dish: Dish; url: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const label = dish.number != null ? `${dish.number}. ${dish.name}` : dish.name;

  async function upload(file: File) {
    setError(null);
    setBusy("upload");
    try {
      const { blob, width, height } = await resizePhoto(file);
      const form = new FormData();
      form.set("itemId", dish.id);
      form.set("photo", blob, blob.type === "image/webp" ? "photo.webp" : "photo.jpg");
      form.set("width", String(width));
      form.set("height", String(height));
      const res = await fetch("/api/menu/photo", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { ok: boolean; imageUrl?: string; error?: string } | null;
      if (!res.ok || !body?.ok || !body.imageUrl) throw new Error(body?.error ?? "Couldn't save the photo. Try again.");
      onChange(body.imageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the photo. Try again.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setError(null);
    setBusy("remove");
    try {
      const res = await fetch(`/api/menu/photo?itemId=${encodeURIComponent(dish.id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "Couldn't remove the photo. Try again.");
      onChange(null);
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the photo. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-mondy-border">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy !== null}
        aria-label={url ? `Change photo for ${label}` : `Add photo for ${label}`}
        className={`group relative aspect-[4/3] w-full overflow-hidden bg-mondy-yellow-soft ${ring}`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1.5 text-mondy-muted">
            <Camera className="h-7 w-7" aria-hidden />
            <span className="text-sm font-semibold">Add photo</span>
          </span>
        )}
        {url && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-mondy-ink/75 px-2.5 py-1 text-xs font-semibold text-white opacity-90 group-hover:opacity-100">
            <Camera className="h-3.5 w-3.5" aria-hidden />
            Change
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold text-mondy-ink">
            {busy === "upload" ? "Saving…" : "Removing…"}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
        <p className="text-sm font-semibold leading-snug">{label}</p>
        {error && (
          <p role="alert" className="text-xs text-mondy-red-dark">
            {error}
          </p>
        )}
        {url && (
          <div className="mt-auto flex gap-2">
            {confirm ? (
              <>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy !== null}
                  className={`flex-1 rounded-lg bg-mondy-red px-2 py-1.5 text-xs font-semibold text-white hover:bg-mondy-red-dark disabled:opacity-50 ${ring}`}
                >
                  Remove photo
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm(false)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold ring-1 ring-mondy-border hover:bg-mondy-cream ${ring}`}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirm(true)}
                disabled={busy !== null}
                className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-mondy-muted ring-1 ring-mondy-border hover:bg-mondy-cream hover:text-mondy-ink ${ring}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </button>
            )}
          </div>
        )}
        {!url && !error && (
          <p className="mt-auto flex items-center gap-1 text-xs text-mondy-muted">
            <ImageOff className="h-3.5 w-3.5" aria-hidden />
            No photo yet
          </p>
        )}
      </div>
    </li>
  );
}
