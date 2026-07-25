import ScreenTitle from '@/components/ScreenTitle';
import Panel from '@/components/Panel';
import Loader from '@/components/Loader';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query } from '@firebase/firestore';
import { firestore } from '@/utils/firebase';
import { FireDoc } from '@/Enum/FireDoc';
import useDynamicNavbar from '@/hooks/useDynamicNavbar';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import useAdminOnly from '@/hooks/useAdminOnly';
import Achievement from '@/models/Achievement';
import User from '@/models/User';
import { getUserDetailsFunction } from '@/utils/functions';
import { RawFirestoreTimestamp, RawUserDetailsPin, RawUserDetailsQuestion } from '@/models/Raw';
import { getPinTypeFriendlyName, PinType } from '@/Enum/PinType';
import toast from 'react-hot-toast';

const ANSWER_KEYS = ['a', 'b', 'c', 'd'];

function formatDate (timestamp: RawFirestoreTimestamp | null): string {
    if (!timestamp) {
        return '-';
    }

    return new Date(timestamp._seconds * 1000).toLocaleString('pl-PL');
}

function summaryRows (user: User, unlocked: number, achievementCount: number): [string, string][] {
    return [
        ['Punkty', String(user.score)],
        ['Oczekujące', String(user.pendingScore)],
        ['Pinezki', String(user.amountOfCollectedPins)],
        ['Pytania', String(user.amountOfAnsweredQuestions)],
        ['Poprawne', String(user.amountOfCorrectAnswers)],
        ['Osiągnięcia', `${unlocked} / ${achievementCount}`],
        ['Rola', user.role],
        ['Gracz z poprzednich lat', user.isReturningPlayer ? 'tak' : 'nie'],
        ['Wygrana runda', user.winnerInRound ?? '-'],
        ['Ostatnia akcja', user.updatedAt.toLocaleString('pl-PL')]
    ];
}

function QuestionEntry ({ entry }: { entry: RawUserDetailsQuestion }) {
    // Three states, and the order matters: a drawn-but-unanswered question also carries
    // `isCorrect: false` (it is stamped that way at draw time), so `given` has to be checked first.
    const unanswered = entry.given === null;
    const status = unanswered
        ? 'Bez odpowiedzi'
        : (entry.isCorrect ? 'Poprawnie' : 'Błędnie');

    return (
        <div className="p-3 my-3 rounded-xl bg-background text-left">
            <div className="flex justify-between items-baseline gap-2">
                <h3 className="font-semibold text-text-accent">
                    {entry.question ?? `Pytanie usunięte z bazy (${entry.uid})`}
                </h3>
                <span className="whitespace-nowrap">{entry.value} pkt</span>
            </div>
            <p className="text-sm mb-2">{status} · {formatDate(entry.collectedAt)}</p>
            {entry.answers && <ul>
                {ANSWER_KEYS.map((key) => {
                    const picked = entry.given === key;
                    const isKey = entry.correct === key;

                    return (
                        <li key={key} className={isKey ? 'font-bold text-text-accent' : ''}>
                            {key}) {entry.answers?.[key]}
                            {picked && ' ← odpowiedź gracza'}
                            {isKey && ' ✓'}
                        </li>
                    );
                })}
            </ul>}
        </div>
    );
}

// Per-player drill-down (#79). Read-only: the user doc and the achievement definitions are
// admin-readable directly, while collectedPins/collectedQuestions come from getUserDetailsHandle -
// no client can read those two at all.
export default function UserAdminPage () {
    useAdminOnly();

    const router = useRouter();
    const uid = typeof router.query.uid === 'string' ? router.query.uid : null;

    const [user, setUser] = useState<User | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [pins, setPins] = useState<RawUserDetailsPin[]>([]);
    const [questions, setQuestions] = useState<RawUserDetailsQuestion[]>([]);
    const [detailsLoading, setDetailsLoading] = useState<boolean>(true);

    useDynamicNavbar({
        icon: faArrowLeft,
        onClick: () => router.back()
    });

    useEffect(() => {
        if (!uid) {
            return;
        }

        // Live, unlike the definitions below: a recheck triggered from /admin/users should land here
        // without a refresh.
        return onSnapshot(
            doc(firestore, FireDoc.USERS, uid).withConverter(User.getConverter()),
            (snapshot) => setUser(snapshot.data() as User ?? null),
            (error) => {
                console.error(error);
                toast.error('Nie udało się wczytać gracza.');
            }
        );
    }, [uid]);

    useEffect(() => {
        getDocs(query(collection(firestore, FireDoc.ACHIEVEMENTS)).withConverter(Achievement.getConverter()))
            .then((snapshot) => setAchievements(snapshot.docs.map((docSnapshot) => docSnapshot.data() as Achievement)))
            .catch((error) => {
                console.error(error);
                toast.error('Nie udało się wczytać osiągnięć.');
            });
    }, []);

    useEffect(() => {
        if (!uid) {
            return;
        }

        setDetailsLoading(true);

        getUserDetailsFunction({ uid })
            .then((result) => {
                setPins(result.data.pins);
                setQuestions(result.data.questions);
            })
            .catch((error) => {
                console.error(error);
                toast.error('Nie udało się wczytać szczegółów gracza.');
            })
            .finally(() => setDetailsLoading(false));
    }, [uid]);

    const sortedAchievements = [...achievements].sort((a, b) => a.order - b.order || a.target - b.target);
    const sortedPins = [...pins].sort((a, b) => (b.collectedAt?._seconds ?? 0) - (a.collectedAt?._seconds ?? 0));
    const unlocked = user ? sortedAchievements.filter((achievement) => achievement.isUnlockedBy(user)).length : 0;

    return (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <ScreenTitle>{user ? user.username : 'Gracz'}</ScreenTitle>

            {!user && <Loader/>}

            {user && <div>
                <Panel title="Podsumowanie">
                    <table className="table-auto text-left">
                        <tbody>
                            {summaryRows(user, unlocked, sortedAchievements.length).map(([label, value]) => (
                                <tr key={label}>
                                    <td className="pr-4">{label}</td>
                                    <td>{value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>

                <Panel title="Osiągnięcia" className={'overflow-scroll'}>
                    <table className="table-auto whitespace-nowrap min-w-full">
                        <thead>
                            <tr className="text-left">
                                <th className="p-2">Lp.</th>
                                <th className="p-2">Odznaka</th>
                                <th className="p-2">Postęp</th>
                                <th className="p-2">Bonus</th>
                                <th className="p-2">Zdobyte</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedAchievements.map((achievement, index) => {
                                const unlockedBy = achievement.isUnlockedBy(user);
                                const earned = user.achievements[achievement.uid];
                                // Same accessors the player's own progress bar reads, so the two agree.
                                const { current, target } = achievement.progressFor(user);

                                return (
                                    <tr
                                        key={achievement.uid}
                                        className={
                                            (index % 2 ? 'bg-background ' : '')
                                            + (unlockedBy ? '' : 'opacity-60')
                                        }
                                    >
                                        <td className="p-2">{index + 1}</td>
                                        <td className="p-2">{achievement.name}</td>
                                        <td className="p-2">{current} / {target}</td>
                                        <td className="p-2">{earned ? earned.bonus : achievement.bonus}</td>
                                        <td className="p-2">
                                            {earned ? earned.grantedAt.toLocaleString('pl-PL') : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Panel>

                <Panel title="Pinezki" loading={detailsLoading} className={'overflow-scroll'}>
                    {sortedPins.length === 0 && !detailsLoading && <p>Brak zebranych pinezek.</p>}
                    {sortedPins.length > 0 && <table className="table-auto whitespace-nowrap min-w-full">
                        <thead>
                            <tr className="text-left">
                                <th className="p-2">Lp.</th>
                                <th className="p-2">Nazwa</th>
                                <th className="p-2">Typ</th>
                                <th className="p-2">PKT</th>
                                <th className="p-2">Data</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedPins.map((pin, index) => (
                                <tr key={pin.uid} className={index % 2 ? 'bg-background' : ''}>
                                    <td className="p-2">{index + 1}</td>
                                    <td className="p-2">{pin.name}</td>
                                    <td className="p-2">{getPinTypeFriendlyName(pin.type)}</td>
                                    <td className="p-2">
                                        {pin.awardedPoints} / {pin.value}
                                        {pin.awardedPoints === 0 && pin.type === PinType.PHOTO
                                            && <span className="text-sm"> (czeka na akceptację)</span>}
                                    </td>
                                    <td className="p-2">{formatDate(pin.collectedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>}
                </Panel>

                <Panel title="Pytania" loading={detailsLoading}>
                    {questions.length === 0 && !detailsLoading && <p>Brak wylosowanych pytań.</p>}
                    {questions.map((entry) => <QuestionEntry key={entry.uid} entry={entry}/>)}
                </Panel>
            </div>}
        </main>
    );
}
