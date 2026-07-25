import Pin from '@/models/Pin';
import PinGroup from '@/models/PinGroup';
import ScreenTitle from '@/components/ScreenTitle';
import Panel from '@/components/Panel';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { Page } from '@/Enum/Page';
import { collection, onSnapshot } from '@firebase/firestore';
import { firestore } from '@/utils/firebase';
import { FireDoc } from '@/Enum/FireDoc';
import useDynamicNavbar from '@/hooks/useDynamicNavbar';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import useAdminOnly from '@/hooks/useAdminOnly';
import { getPinTypeFriendlyName } from '@/Enum/PinType';
import { getMap, MAP_AREA_LABELS, maps } from '@/utils/maps';
import { saveLastMapId } from '@/utils/mapView';
import toast from 'react-hot-toast';

function getMapLabel (mapId: string): string {
    const map = getMap(mapId);

    if (!map) {
        return mapId;
    }

    return MAP_AREA_LABELS[map.area] + (map.floorLabel ? ` · ${map.floorLabel}` : '');
}

export default function PinsAdminPage () {
    useAdminOnly();

    const router = useRouter();
    const [pins, setPins] = useState<Pin[]>([]);
    const [groupNames, setGroupNames] = useState<Record<string, string>>({});

    useDynamicNavbar({
        icon: faArrowLeft,
        onClick: () => router.back()
    });

    useEffect(() => {
        return onSnapshot(
            collection(firestore, FireDoc.PINS).withConverter(Pin.getConverter()),
            (snapshot) => setPins(snapshot.docs.map((doc) => doc.data() as Pin)),
            (error) => {
                console.error(error);
                toast.error('Nie udało się wczytać pinezek.');
            }
        );
    }, []);

    useEffect(() => {
        return onSnapshot(
            collection(firestore, FireDoc.PIN_GROUPS).withConverter(PinGroup.getConverter()),
            (snapshot) => setGroupNames(Object.fromEntries(
                snapshot.docs.map((doc) => doc.data() as PinGroup).map((group) => [group.uid, group.name])
            )),
            (error) => {
                console.error(error);
                toast.error('Nie udało się wczytać grup pinezek.');
            }
        );
    }, []);

    const sortedPins = useMemo(() => [...pins].sort((a, b) => {
        const mapDiff = maps.findIndex((map) => map.mapId === a.mapId)
            - maps.findIndex((map) => map.mapId === b.mapId);

        return mapDiff !== 0 ? mapDiff : a.name.localeCompare(b.name, 'pl');
    }), [pins]);

    const goToPin = (mapId: string) => {
        saveLastMapId(mapId);
        router.push(Page.MAP);
    };

    return (
        <main className="grid grid-rows-layout items-center min-h-screen p-4">
            <ScreenTitle>Lista pinezek</ScreenTitle>

            <Panel title="Pinezki" className={'overflow-scroll'}>
                <table className="table-auto whitespace-nowrap min-w-full">
                    <thead>
                        <tr className="text-left">
                            <th className="p-2">Lp.</th>
                            <th className="p-2">N</th>
                            <th className="p-2">PKT</th>
                            <th className="p-2">Nazwa</th>
                            <th className="p-2">Typ</th>
                            <th className="p-2">Mapa</th>
                            <th className="p-2">Grupy</th>
                            <th className="p-2">Aktywna</th>
                            <th className="p-2">Ostatnia osoba</th>
                            <th className="p-2">Ostatnio zebrano</th>
                            <th className="p-2">Kod</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedPins.map((pin, index) => {
                            const finders = Object.values(pin.collectedBy)
                                .sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime());
                            const lastFinder = finders[0];

                            return (
                                <tr key={pin.uid} className={index % 2 ? 'bg-background' : ''}>
                                    <td className="p-2">{index + 1}</td>
                                    <td className="p-2">{finders.length}</td>
                                    <td className="p-2">{pin.value}</td>
                                    <td className="p-2">
                                        <button
                                            type="button"
                                            className="underline"
                                            onClick={() => goToPin(pin.mapId)}
                                        >{pin.name}</button>
                                    </td>
                                    <td className="p-2">{getPinTypeFriendlyName(pin.type)}</td>
                                    <td className="p-2">{getMapLabel(pin.mapId)}</td>
                                    <td className="p-2">
                                        {pin.groups.map((uid) => groupNames[uid] ?? uid).join(', ')}
                                    </td>
                                    <td className="p-2">{pin.isActive ? 'Tak' : 'Nie'}</td>
                                    <td className="p-2">{lastFinder?.username}</td>
                                    <td className="p-2">{lastFinder?.collectedAt.toLocaleString('pl-PL')}</td>
                                    <td className="p-2 font-mono">{pin.code ?? ''}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </Panel>
        </main>
    );
}
