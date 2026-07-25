import ScreenTitle from '@/components/ScreenTitle';
import Panel from '@/components/Panel';
import Button, { ButtonState } from '@/components/Button';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query } from '@firebase/firestore';
import { firestore } from '@/utils/firebase';
import { FireDoc } from '@/Enum/FireDoc';
import useDynamicNavbar from '@/hooks/useDynamicNavbar';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import useAdminOnly from '@/hooks/useAdminOnly';
import Achievement from '@/models/Achievement';
import User from '@/models/User';
import { UserRole } from '@/Enum/UserRole';
import { AchievementType } from '@/functions/src/types/achievement';
import toast from 'react-hot-toast';

const TYPE_LABELS: Record<AchievementType, string> = {
    points: 'Punkty',
    correctAnswers: 'Odpowiedzi',
    pinsInScope: 'Pinezki'
};

// One-shot fetch, not a live listener: a badge-distribution table has no reason to re-render on every
// score increment during peak play, and both collections are small enough to reread on demand.
export default function AchievementsAdminPage () {
    useAdminOnly();

    const router = useRouter();
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [players, setPlayers] = useState<User[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    useDynamicNavbar({
        icon: faArrowLeft,
        onClick: () => router.back()
    });

    const reload = useCallback(() => {
        setLoading(true);

        Promise.all([
            getDocs(query(collection(firestore, FireDoc.ACHIEVEMENTS))
                .withConverter(Achievement.getConverter())),
            getDocs(query(collection(firestore, FireDoc.USERS)).withConverter(User.getConverter()))
        ])
            .then(([achievementsSnapshot, usersSnapshot]) => {
                // Deliberately NOT useAchievements(): that hook drops `target < 1`, which is exactly
                // the drift (an empty type:/map:/group: scope) this screen exists to surface.
                setAchievements(achievementsSnapshot.docs.map((doc) => doc.data() as Achievement));

                // Admin and dashboard accounts would skew both the count and the percentage.
                setPlayers(usersSnapshot.docs
                    .map((doc) => doc.data() as User)
                    .filter((user) => user.role === UserRole.USER));
            })
            .catch((error) => {
                console.error(error);
                toast.error('Nie udało się wczytać osiągnięć.');
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const sorted = [...achievements].sort((a, b) => a.order - b.order || a.target - b.target);

    return (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <ScreenTitle>Statystyki osiągnięć</ScreenTitle>

            <Panel title="Osiągnięcia" loading={loading} className={'overflow-scroll'}>
                <p className="mb-4 text-justify">
                    Ilu graczy zdobyło każde osiągnięcie. Liczby dotyczą wyłącznie kont graczy
                    - konta administratora i dashboardu są pominięte. Graczy: {players.length}.
                </p>

                <Button
                    className="mb-4"
                    state={loading ? ButtonState.PENDING : ButtonState.ENABLED}
                    onClick={reload}
                >Odśwież</Button>

                <table className="table-auto whitespace-nowrap min-w-full">
                    <thead>
                        <tr className="text-left">
                            <th className="p-2">Lp.</th>
                            <th className="p-2">Odznaka</th>
                            <th className="p-2">Typ</th>
                            <th className="p-2">Cel</th>
                            <th className="p-2">Bonus</th>
                            <th className="p-2">Zdobyło</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((achievement, index) => {
                            const holders = players.filter((player) => achievement.isUnlockedBy(player)).length;
                            const percentage = players.length > 0
                                ? Math.round((holders / players.length) * 100)
                                : 0;
                            const unreachable = achievement.target < 1;

                            return (
                                <tr
                                    key={achievement.uid}
                                    className={
                                        (index % 2 ? 'bg-background ' : '')
                                        + (unreachable ? 'opacity-60' : '')
                                    }
                                >
                                    <td className="p-2">{index + 1}</td>
                                    <td className="p-2">
                                        {achievement.name}
                                        {unreachable && <span className="text-sm"> (pusty zakres)</span>}
                                    </td>
                                    <td className="p-2">{TYPE_LABELS[achievement.type] ?? achievement.type}</td>
                                    <td className="p-2">{achievement.target}</td>
                                    <td className="p-2">{achievement.bonus}</td>
                                    <td className="p-2">{holders} ({percentage}%)</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </Panel>
        </main>
    );
}
