import { useLocalSearchParams } from 'expo-router';
import { isThreadKind } from '@/chat/model';
import { ThreadScreen } from '@/chat/thread';
import { Back, Screen } from '@/ui/kit';

/** A private conversation, a group or a room; the address says which. */
export default function ThreadRoute() {
  const { kind, id, at } = useLocalSearchParams<{ kind: string; id: string; at?: string }>();
  const seq = at && /^\d+$/.test(at) ? Number(at) : null;
  if (!isThreadKind(kind)) {
    return (
      <Screen>
        <Back />
      </Screen>
    );
  }
  // A different thread starts afresh, with nothing of the one before.
  return <ThreadScreen key={`${kind}:${id}:${seq}`} kind={kind} id={id} at={seq} />;
}
