import Pin from '@/models/Pin';
import ScreenTitle from '@/components/ScreenTitle';
import Panel from '@/components/Panel';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Page } from '@/Enum/Page';
import { collection, onSnapshot } from '@firebase/firestore';
import { firestore } from '@/utils/firebase';
import { FireDoc } from '@/Enum/FireDoc';
import useDynamicNavbar from '@/hooks/useDynamicNavbar';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import useAdminOnly from '@/hooks/useAdminOnly';
import { saveLastMapId } from '@/utils/mapView';
import toast from 'react-hot-toast';

type RecentlyCollectedEntry = { uid: string, name: string, mapId: string, username: string, collectedAt: Date }

// ~60 pins × up to 150 finders is ~9k entries by day 3 - fine to fetch (onSnapshot ships deltas after
// the first load), not fine to render on an admin phone. This is a "what just happened" feed.
const MAX_RENDERED_ENTRIES = 500;

export default function RecentlyCollectedPinsAdminPage () {
    useAdminOnly();

    const router = useRouter();
    const [listOfEntries, setListOfEntries] = useState<RecentlyCollectedEntry[]>([]);

    useDynamicNavbar({
        icon: faArrowLeft,
        onClick: () => router.back()
    });

    useEffect(() => {
        return onSnapshot(
            collection(firestore, FireDoc.PINS).withConverter(Pin.getConverter()),
            (snapshot) => {
                const entries: RecentlyCollectedEntry[] = [];

                snapshot.docs.map((doc) => doc.data() as Pin)
                    .forEach((pin) => {
                        Object.values(pin.collectedBy).forEach(({ username, collectedAt }) => {
                            entries.push({
                                uid: pin.uid,
                                name: pin.name,
                                mapId: pin.mapId,
                                username,
                                collectedAt
                            });
                        });
                    });

                entries.sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime());

                setListOfEntries(entries);
            },
            (error) => {
                console.error(error);
                toast.error('Nie udało się wczytać pinezek.');
            }
        );
    }, []);

    const goToPin = (mapId: string) => {
        saveLastMapId(mapId);
        router.push(Page.MAP);
    };

    return (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <ScreenTitle>Ostatnio zebrane pinezki</ScreenTitle>

            <Panel title="" className={'overflow-scroll'}>
                <table className="table-auto whitespace-nowrap min-w-full">
                    <thead>
                        <tr className="text-left">
                            <th className="p-2">Lp.</th>
                            <th className="p-2">Pinezka</th>
                            <th className="p-2">Osoba</th>
                            <th className="p-2">Data</th>
                        </tr>
                    </thead>
                    <tbody>
                        {listOfEntries.slice(0, MAX_RENDERED_ENTRIES).map((entry, index) => (
                            <tr
                                key={entry.uid + entry.username + entry.collectedAt.getTime()}
                                className={index % 2 ? 'bg-background' : ''}
                            >
                                <td className="p-2">{index + 1}</td>
                                <td className="p-2">
                                    <button
                                        type="button"
                                        className="underline"
                                        onClick={() => goToPin(entry.mapId)}
                                    >{entry.name}</button>
                                </td>
                                <td className="p-2">{entry.username}</td>
                                <td className="p-2">{entry.collectedAt.toLocaleString('pl-PL')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <p className="p-2 text-sm opacity-70">
                    Pokazano {Math.min(listOfEntries.length, MAX_RENDERED_ENTRIES)} z {listOfEntries.length}
                </p>
            </Panel>
        </main>
    );
}
