import Pin from '@/models/Pin';
import ScreenTitle from '@/components/ScreenTitle';
import Panel from '@/components/Panel';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from '@firebase/firestore';
import { firestore } from '@/utils/firebase';
import { FireDoc } from '@/Enum/FireDoc';
import useDynamicNavbar from '@/hooks/useDynamicNavbar';
import { faArrowLeft, faStar } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import useAdminOnly from '@/hooks/useAdminOnly';
import { getPolishPluralForm } from '@/utils/date';
import toast from 'react-hot-toast';

type FeedbackRow = { username: string, rating: number, talkName: string, collectedAt: Date }
type FeedbackGroup = { uid: string, name: string, average: number, rows: FeedbackRow[] }

function ratingsCount (count: number): string {
    const form = getPolishPluralForm(count);
    return `${count} ${form === 'singular' ? 'ocena' : form === 'plural' ? 'oceny' : 'ocen'}`;
}

export default function PinFeedbackAdminPage () {
    useAdminOnly();

    const router = useRouter();
    const [listOfGroups, setListOfGroups] = useState<FeedbackGroup[]>([]);

    useDynamicNavbar({
        icon: faArrowLeft,
        onClick: () => router.back()
    });

    useEffect(() => {
        return onSnapshot(
            collection(firestore, FireDoc.PINS).withConverter(Pin.getConverter()),
            (snapshot) => {
                const groups: FeedbackGroup[] = [];

                snapshot.docs.map((doc) => doc.data() as Pin)
                    .forEach((pin) => {
                        // Keyed on the entry carrying a rating, not on pin.type - an entry-level check
                        // can never produce a room with an empty table.
                        const rows: FeedbackRow[] = Object.values(pin.collectedBy)
                            .filter((entry) => entry.rating !== null && entry.talkName !== null)
                            .map((entry) => ({
                                username: entry.username,
                                rating: entry.rating as number,
                                talkName: entry.talkName as string,
                                collectedAt: entry.collectedAt
                            }));

                        if (rows.length === 0) {
                            return;
                        }

                        rows.sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime());

                        groups.push({
                            uid: pin.uid,
                            name: pin.name,
                            average: rows.reduce((sum, row) => sum + row.rating, 0) / rows.length,
                            rows
                        });
                    });

                groups.sort((a, b) => a.name.localeCompare(b.name, 'pl'));

                setListOfGroups(groups);
            },
            (error) => {
                console.error(error);
                toast.error('Nie udało się wczytać ocen.');
            }
        );
    }, []);

    return (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <ScreenTitle>Oceny prelekcji</ScreenTitle>

            {/* min-w-0: without it this grid item grows to the widest table and the Panels never clip. */}
            <div className="min-w-0">
                {listOfGroups.length === 0 &&
                    <Panel>
                        <p className="text-center font-semibold">Brak ocen do wyświetlenia.</p>
                    </Panel>
                }

                {listOfGroups.map((group) => (
                    <Panel key={group.uid} title={group.name} className={'overflow-scroll'}>
                        <p className="p-2">
                            {ratingsCount(group.rows.length)} · średnia {group.average.toFixed(1)}
                            <FontAwesomeIcon className="px-1" icon={faStar} size="sm"/>
                        </p>

                        <table className="table-auto whitespace-nowrap min-w-full">
                            <thead>
                                <tr className="text-left">
                                    <th className="p-2">Lp.</th>
                                    <th className="p-2">Ocena</th>
                                    <th className="p-2">Prelekcja</th>
                                    <th className="p-2">Osoba</th>
                                    <th className="p-2">Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.rows.map((row, index) => (
                                    <tr
                                        key={row.username + row.collectedAt.getTime()}
                                        className={index % 2 ? 'bg-background' : ''}
                                    >
                                        <td className="p-2">{index + 1}</td>
                                        <td className="p-2">{row.rating}</td>
                                        <td className="p-2">{row.talkName}</td>
                                        <td className="p-2">{row.username}</td>
                                        <td className="p-2">{row.collectedAt.toLocaleString('pl-PL')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Panel>
                ))}
            </div>
        </main>
    );
}
