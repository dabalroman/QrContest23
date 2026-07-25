import Panel from '@/components/Panel';
import ScreenTitle from '@/components/ScreenTitle';
import LinkButton from '@/components/LinkButton';
import React, { useContext, useEffect, useState } from 'react';
import { UserContext, UserContextType } from '@/utils/context';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationDot, faStar } from '@fortawesome/free-solid-svg-icons';
import Metatags from '@/components/Metatags';
import { UserRole } from '@/Enum/UserRole';
import Button from '@/components/Button';
import SegmentedControl from '@/components/SegmentedControl';
import PinTypeLegend from '@/components/PinTypeLegend';
import { seedDatabaseFunction, updateRoundsFunction } from '@/utils/functions';
import toast from 'react-hot-toast';
import { Page } from '@/Enum/Page';
import { auth, firestore } from '@/utils/firebase';
import { useRouter } from 'next/router';
import { MapQuality } from '@/Enum/MapQuality';
import { getMapQuality, setMapQuality } from '@/utils/mapQuality';
// CLUBS-DISABLED-2026: club UI hidden for the 2026 edition
// import Guild from '@/models/Guild';
// import { doc, onSnapshot } from '@firebase/firestore';
// import { FireDoc } from '@/Enum/FireDoc';
// import CurrentGuildPanel from '@/components/account/CurrentGuildPanel';
// import JoinGuildPanel from '@/components/account/JoinGuildPanel';
// import BetrayGuildPanel from '@/components/account/BetrayGuildPanel';

export default function AccountPage () {
    const router = useRouter();
    const { user } = useContext<UserContextType>(UserContext);

    // Read after mount: getMapQuality() returns HIGH on the server, so the first client render matches SSR
    // and the stored value is picked up in the effect (avoids a hydration mismatch).
    const [mapQuality, setMapQualityState] = useState<MapQuality>(MapQuality.HIGH);
    useEffect(() => setMapQualityState(getMapQuality()), []);

    const chooseMapQuality = (quality: MapQuality) => {
        setMapQuality(quality);
        setMapQualityState(quality);
    };

    /* CLUBS-DISABLED-2026: guild subscription hidden for the 2026 edition
    const [guild, setGuild] = useState<Guild | null>(null);
    const [guildLoading, setGuildLoading] = useState<boolean>(false);

    useEffect(() => {
        if (user?.memberOf === null) {
            return;
        }

        setGuildLoading(true);

        return onSnapshot(
            doc(firestore, FireDoc.GUILDS, user?.memberOf as string)
                .withConverter(Guild.getConverter()),
            (snapshot) => {
                const guild = snapshot.data() as Guild;
                setGuild(guild);
                setGuildLoading(false);
            }
        );
    }, [user?.memberOf]);
    */

    const AdminSection = () => (
        <Panel title="Admin">
            <LinkButton href={Page.ADMIN_RECENTLY_COLLECTED} className={'mt-4'}>Ostatnio zebrane pinezki</LinkButton>
            <LinkButton href={Page.ADMIN_PINS} className={'mt-4'}>Lista pinezek</LinkButton>
            <LinkButton href={Page.ADMIN_USERS} className={'mt-4'}>Lista użytkowników</LinkButton>
            <LinkButton href={Page.ADMIN_PHOTO_REVIEW} className={'mt-4'}>Zdjęcia do weryfikacji</LinkButton>
            <LinkButton href={Page.ADMIN_FEEDBACK} className={'mt-4'}>Oceny prelekcji</LinkButton>
            <LinkButton href={Page.ADMIN_ACHIEVEMENTS} className={'mt-4'}>Statystyki osiągnięć</LinkButton>
            <LinkButton href={Page.DASHBOARD} className={'mt-4'}>Podgląd dashboardu</LinkButton>

            <Button className="w-full mt-4" onClick={() => {
                updateRoundsFunction()
                    .then((result) => toast.success(result.data.result))
                    .catch((error) => toast.error('Update failed: ' + error.message));

            }}>Sprawdź i zamknij rundy</Button>

            <p className={'py-2 mt-20'}>Niebezpiecznie jest schodzić niżej!</p>
            <Button className="w-full" style={{
                background: '#660000',
                borderColor: '#BB0000'
            }} onClick={() => {
                const proceed = confirm('Are you sure?') ?? false;

                if (!proceed) {
                    return;
                }

                const password = prompt('Password?') ?? '';

                if (!password) {
                    return;
                }

                seedDatabaseFunction({ password: password })
                    .then(() => toast.success('DB seed succeed.'))
                    .catch((error) => toast.error('DB seed failed: ' + error.message));

            }}>Seed database</Button>
        </Panel>
    );

    return user && (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <ScreenTitle>Profil</ScreenTitle>
            <Metatags title="Profil"/>
            <div>
                {user.role === UserRole.ADMIN && <AdminSection/>}

                <Panel title={user.username ?? '...'} className="text-center">
                    <div className="flex place-content-around text-4xl text-text-accent p-4">
                        <div>
                            <FontAwesomeIcon className="px-1" icon={faLocationDot} size="sm"/>&nbsp;
                            {user?.amountOfCollectedPins}
                        </div>
                        <div><FontAwesomeIcon className="px-1" icon={faStar} size="sm"/>&nbsp;{user?.score}</div>
                    </div>
                </Panel>

                {/* CLUBS-DISABLED-2026: {user.memberOf === null && <JoinGuildPanel/>} */}

                <Panel title="Nagrody">
                    <img src="/prize.webp" alt="prize" className="absolute right-0 bottom-0" style={{
                        zIndex: -1,
                        maxHeight: '80%'
                    }}/>
                    <p className="text-2xl">
                        <span className="font-semibold text-text-accent">1. miejsce <br/></span>
                        <span>50 fantów</span>
                        <span className="block text-sm">w każdej rundzie</span>
                    </p>
                    <p className="text-xl pt-3">
                        <span className="font-semibold text-text-accent">2. miejsce <br/> </span>
                        <span>35 fantów</span>
                        <span className="block text-sm">w każdej rundzie</span>
                    </p>
                    <p className="text-lg pt-3">
                        <span className="font-semibold text-text-accent">3. miejsce <br/> </span>
                        <span>20 fantów</span>
                        <span className="block text-sm">w każdej rundzie</span>
                    </p>
                </Panel>

                <Panel title="Rundy">
                    <p className="mt-2 text-justify">
                        Konkurs podzielony jest na dwie rundy. Daty rozpoczęcia i zakończenia każdej z nich znajdziesz
                        w zakładce &quot;Ranking&quot;. Punkty z rundy pierwszej przechodzą do rundy drugiej,
                        więc masz aż dwie szanse na wygraną! Każda runda to troje zwycięzców.
                    </p>
                    <p className="mt-2 text-justify">
                        Zwycięzców zapraszamy po odbiór nagród do punktu informacyjnego konwentu w momencie
                        zakończenia rundy.
                    </p>
                </Panel>

                <Panel title="Jakość map">
                    <p className="mt-2 text-justify">
                        Mapy w wysokiej jakości wyglądają ostrzej, ale na starszych telefonach mogą działać
                        wolniej. Jeśli mapa się zacina, wybierz niską jakość.
                    </p>
                    <SegmentedControl
                        className="mt-4"
                        value={mapQuality}
                        onChange={chooseMapQuality}
                        options={[
                            { value: MapQuality.HIGH, label: 'Wysoka' },
                            { value: MapQuality.LOW, label: 'Niska' }
                        ]}
                    />
                </Panel>

                <Panel title="Pinezki">
                    <p className="mb-4 text-justify">
                        Teren konwentu to dziewięć map, a każdą pinezkę zdobywa się inaczej.
                        Po ikonie od razu poznasz, co trzeba zrobić:
                    </p>

                    <PinTypeLegend/>
                </Panel>

                {/* CLUBS-DISABLED-2026: club panels hidden for the 2026 edition
                {user.memberOf && guild && <CurrentGuildPanel guild={guild} loading={guildLoading}/>}
                {user.memberOf && guild && <BetrayGuildPanel user={user} guild={guild}/>}
                */}

                <Panel title="Regulamin i pytania">
                    <p>
                        Masz pytania o sposób działania konkursu? Sprawdź sekcję &quot;Pytania i odpowiedzi&quot;.
                    </p>
                    <LinkButton className="mt-4" href={Page.FAQ}>Pytania i odpowiedzi</LinkButton>
                    <LinkButton className="mt-4" href={Page.RULEBOOK}>Regulamin konkursu</LinkButton>
                </Panel>

                <Panel title={'Kontakt'}>
                    <p className="text-justify">
                        Coś nie działa? Masz jakieś pytania? <br/>
                        W razie potrzeby możesz skontaktować się bezpośrednio z organizatorem konkursu przez
                        email <a href="mailto:dabalroman@gmail.com" className="underline">dabalroman@gmail.com</a> lub
                        przez <a href="https://m.me/roman.dabal" className="underline">messenger</a>.
                    </p>
                </Panel>

                <Panel title="Konto">
                    <p className="pb-4 text-justify">
                        Wylogowanie zakończy Twoją sesję w aplikacji. Do zobaczenia!
                    </p>
                    <Button
                        onClick={async () => {
                            // Sign out BEFORE navigating: on Page.MAIN _app redirects a ready user
                            // to the map, so leaving the sign-out until after the push lands the
                            // now-anonymous visitor on /map, which AuthCheck answers with a 404.
                            await auth.signOut();
                            await router.replace(Page.MAIN);
                            toast.success('Wylogowano pomyślnie.');
                        }}
                        className="w-full"
                    >
                        Wyloguj
                    </Button>
                </Panel>
            </div>
        </main>
    );
}
