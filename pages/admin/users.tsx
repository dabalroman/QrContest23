import ScreenTitle from '@/components/ScreenTitle';
import Panel from '@/components/Panel';
import Button, { ButtonState } from '@/components/Button';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from '@firebase/firestore';
import { firestore } from '@/utils/firebase';
import { FireDoc } from '@/Enum/FireDoc';
import { recheckAchievementsFunction } from '@/utils/functions';
import useDynamicNavbar from '@/hooks/useDynamicNavbar';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import useAdminOnly from '@/hooks/useAdminOnly';
import User from '@/models/User';
import toast from 'react-hot-toast';

export default function UsersAdminPage () {
    useAdminOnly();

    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    // Which recheck is running: a user uid, 'all', or null. Blocks the buttons while one is in flight.
    const [busy, setBusy] = useState<string | null>(null);

    useDynamicNavbar({
        icon: faArrowLeft,
        onClick: () => router.back()
    });

    useEffect(() => {
        // Sort users by username filed ACS
        const q = query(collection(firestore, FireDoc.USERS), orderBy('username', 'asc'))
            .withConverter(User.getConverter());

        return onSnapshot(
            q,
            (snapshot) => {
                const users = snapshot.docs.map((doc) => doc.data() as User);

                setUsers(users as User[]);
            }
        );
    }, []);

    const recheck = async (uid?: string) => {
        if (busy) {
            return;
        }

        setBusy(uid ?? 'all');

        try {
            const { data } = await recheckAchievementsFunction(uid ? { uid } : {});

            toast.success(uid
                ? `Przyznano ${data.totalGranted} odznak.`
                : `Przeliczono ${data.usersProcessed} graczy, przyznano ${data.totalGranted} odznak.`);
        } catch (error) {
            toast.error('Błąd: ' + (error as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const buttonState = (label: string) =>
        busy === label ? ButtonState.PENDING : busy ? ButtonState.DISABLED : ButtonState.ENABLED;

    return (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <ScreenTitle>Lista użytkowników</ScreenTitle>

            <Panel title="Użytkownicy" loading={!users} className={'overflow-scroll'}>
                <Button
                    className="mb-4"
                    state={buttonState('all')}
                    onClick={() => {
                        if (busy) {
                            return;
                        }

                        const proceed = confirm('Przeliczyć osiągnięcia wszystkich graczy? Może chwilę potrwać.');

                        if (proceed) {
                            recheck();
                        }
                    }}
                >Przelicz osiągnięcia (wszyscy)</Button>

                <table className="table-auto whitespace-nowrap min-w-full">
                    <thead>
                        <tr className="text-left">
                            <th className="p-2">Nick</th>
                            <th className="p-2">Wynik</th>
                            <th className="p-2"># pinezek</th>
                            <th className="p-2"># pytań</th>
                            <th className="p-2">Ostatnia akcja</th>
                            <th className="p-2">Akcje</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user, index) => (
                            <tr key={user.uid} className={index % 2 ? 'bg-background' : ''}>
                                <td className="p-2">{user.username}</td>
                                <td className="p-2">{user.score}</td>
                                <td className="p-2">{user.amountOfCollectedPins}</td>
                                <td className="p-2">{user.amountOfAnsweredQuestions}</td>
                                <td className="p-2">{user.updatedAt.toLocaleString('pl-PL')}</td>
                                <td className="p-2">
                                    <Button
                                        className="text-sm"
                                        state={buttonState(user.uid)}
                                        onClick={() => recheck(user.uid)}
                                    >Przelicz</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Panel>
        </main>
    );
}
