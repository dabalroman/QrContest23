import ScreenTitle from '@/components/ScreenTitle';
import Metatags from '@/components/Metatags';
import Panel from '@/components/Panel';
import React, { useContext, useEffect, useState } from 'react';
import { UserContext, UserContextType } from '@/utils/context';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faDiceD6, faUser } from '@fortawesome/free-solid-svg-icons';
import { collection, onSnapshot, orderBy, query } from '@firebase/firestore';
import { firestore } from '@/utils/firebase';
import { FireDoc } from '@/Enum/FireDoc';
import RankingRound, { GuildRankingRecord, UserRankingRecord } from '@/models/RankingRound';
import CurrentRoundPanel from '@/components/ranking/CurrentRoundPanel';
import Button from '@/components/Button';
import RoundRankingTable from '@/components/ranking/RoundRankingTable';
import getGuildIcon from '@/utils/getGuildIcon';
import LinkButton from '@/components/LinkButton';
import { Page } from '@/Enum/Page';

export default function ScoreboardPage ({}) {
    const { user } = useContext<UserContextType>(UserContext);
    const [loading, setLoading] = useState(true);
    const [rankingRounds, setRankingRounds] = useState<RankingRound[]>([]);
    const [currentRound, setCurrentRound] = useState<RankingRound | null>(null);

    useEffect(() => {
        const q = query(collection(firestore, FireDoc.RANKING), orderBy('from', 'asc'))
            .withConverter(RankingRound.getConverter());

        return onSnapshot(
            q,
            (snapshot) => {
                const rounds = snapshot.docs.map((doc) => doc.data() as RankingRound);
                const currentRoundIndex =
                    rounds.findIndex((round: RankingRound) => (round.to.getTime() >= (new Date()).getTime()));

                setRankingRounds(rounds);
                setCurrentRound(rounds[currentRoundIndex] ?? rounds[rounds.length - 1]);
                setLoading(false);
            }
        );

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isCurrentRoundOver = currentRound && currentRound?.to.getTime() < (new Date()).getTime();

    const currentUserPlace: number = currentRound?.users
        .findIndex((record: UserRankingRecord) => record.uid === user?.uid) ?? -1;
    const currentGuildPlace: number = currentRound?.guilds
        .findIndex((guild: GuildRankingRecord) => guild.uid === user?.memberOf) ?? -1;

    return (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <Metatags title="Ranking"/>
            <ScreenTitle>Ranking</ScreenTitle>
            <div>
                <Panel loading={loading} className="text-center">
                    <p className="text-2xl font-fancy-capitals">
                        {user?.username} <br/>
                    </p>
                    <p className="text-2xl">
                        <FontAwesomeIcon className="px-1" icon={faDiceD6} size="sm"/>{user?.score}
                    </p>
                    <p className="mt-1">
                        {currentUserPlace !== -1
                            ? `Jesteś na ${currentUserPlace + 1}. miejscu w rankingu!`
                            : `Nie brałeś/aś udziału w tej rundzie.`
                        }
                    </p>
                    <p className="mt-1">
                        {!user?.memberOf && (
                            <>
                                <span>Nie jesteś członkiem żadnej gildii.</span>
                                <LinkButton className="mt-2" href={Page.GUILD}>Dołącz do gildii</LinkButton>
                            </>
                        )}
                        {user?.memberOf && currentRound?.guilds[currentGuildPlace] && (
                            <span>
                                {currentRound?.guilds[currentGuildPlace].name}
                                {currentGuildPlace !== -1
                                    ? ` zajmuje ${currentGuildPlace + 1}. miejsce.`
                                    : ' nie znajduje się w rankingu.'
                                }
                            </span>
                        )}
                    </p>
                </Panel>

                {currentRound &&
                    <CurrentRoundPanel currentRound={currentRound} loading={loading}/>
                }

                <div className="flex justify-center gap-4">
                    {rankingRounds.map((round: RankingRound) => (
                        <Button key={round.uid} className="w-full" onClick={() => setCurrentRound(round)}>
                            Runda {round.name}
                        </Button>)
                    )}
                </div>

                {currentRound && isCurrentRoundOver &&
                    <Panel title="Zwycięzcy rundy" loading={loading}>
                        <RoundRankingTable user={user} currentRound={currentRound} top3={true}/>
                    </Panel>
                }

                <Panel title="Ranking Gildii">
                    <div>
                        {currentRound?.guilds &&
                            currentRound.guilds.map((guild: GuildRankingRecord) => (
                                <div key={guild.uid} className="mb-4 grid gap-4 grid-cols-[4rem_1fr]">
                                    <div
                                        className={
                                            'border-4 rounded-lg bg-background bg-center bg-cover shadow-card'
                                            + ` h-full border-${guild.uid}`
                                        }
                                        style={{
                                            'backgroundImage': `url(/guilds/${guild.uid}.webp)`
                                        }}
                                    >
                                    </div>
                                    <div className="my-2">
                                        <p className={'pb-0.5' + (user?.memberOf === guild.uid ? ' font-bold' : '')}>
                                            <FontAwesomeIcon
                                                className={`text-${guild.uid} mr-1`}
                                                icon={getGuildIcon(guild?.uid)}
                                                size="xs"
                                            /> {guild.name}
                                        </p>
                                        <div className="grid grid-cols-3 pt-0.5">
                                            <span><FontAwesomeIcon icon={faBolt}/> {guild.power}</span>
                                            <span><FontAwesomeIcon icon={faUser}/> {guild.amountOfMembers}</span>
                                            <span><FontAwesomeIcon icon={faDiceD6}/> {guild.score}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        {(!currentRound?.guilds || currentRound.guilds.length === 0) &&
                            <p className="text-center">Ranking jest pusty.</p>
                        }
                    </div>
                    <div className="text-sm text-center mt-4">
                        <span className="px-4"><FontAwesomeIcon icon={faBolt}/> Siła gildii</span>
                        <span className="px-4"><FontAwesomeIcon icon={faUser}/> Ilość członków</span>
                        <br/>
                        <span className="px-4">
                            <FontAwesomeIcon icon={faDiceD6}/> Suma Rubików wszystkich członków
                        </span>
                    </div>
                </Panel>

                {currentRound &&
                    <Panel title="Ranking rundy" loading={loading}>
                        <RoundRankingTable user={user} currentRound={currentRound}/>
                    </Panel>
                }
            </div>
        </main>
    );
}
