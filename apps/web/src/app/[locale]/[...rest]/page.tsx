import { notFound } from 'next/navigation';

/** Sends unknown paths under a locale to the localized not-found page. */
export default function CatchAllPage() {
  notFound();
}
