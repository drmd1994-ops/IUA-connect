import { Redirect } from 'expo-router';

/** Chat rooms closed in M25: communities replace them. */
export default function BrowseRoomsScreen() {
  return <Redirect href="/communities" />;
}
