import Metatags from '@/components/Metatags';
import React, { useEffect, useState } from 'react';
import Button from '@/components/Button';
import useDynamicNavbar from '@/hooks/useDynamicNavbar';
import { faArrowDown, faArrowUp } from '@fortawesome/free-solid-svg-icons';
import Panel from '@/components/Panel';
import LinkButton from '@/components/LinkButton';
import { Page } from '@/Enum/Page';

export default function Home () {
    const [isTopOfThePage, setIsTopOfThePage] = useState<boolean>(true);

    useEffect(() => {
        const handleScroll = () => {
            setIsTopOfThePage((document.body.scrollTop || document.documentElement.scrollTop) <= 100);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    });

    useDynamicNavbar({
        onlyCenter: true,
        icon: isTopOfThePage ? faArrowDown : faArrowUp,
        href: isTopOfThePage ? '#readme' : '#top'
    });

    return (
        <main>
            <Metatags/>
            <div
                className="min-h-screen relative grid items-center justify-center"
                style={{ gridTemplateRows: '100px 1fr 100px' }}
                id="top"
            >
                <div className="p-4">
                    <img src="/fantasmagoria-logo.svg" className="text-text-half" alt='Fantasmagoria Logo'/>
                </div>
                <div className={
                    'font-fancy text-center flex flex-col justify-center items-center h-64 p-4'
                    + ' bg-gradient-radial from-20% from-panel-transparent-end to-75% to-transparent'
                }>
                    <h1 className="text-4xl p-0.5" style={{ textShadow: '0 4px 4px rgba(0,0,0,0.25)' }}>QrContest</h1>
                    <h2 className="text-lg p-0.5" style={{ textShadow: '0 4px 4px rgba(0,0,0,0.25)' }}>
                        Zbierz je wszystkie!
                    </h2>
                </div>
                <div className="absolute bottom-11 w-full p-4">
                    <LinkButton href={Page.ENTER} className="w-full my-2">Zaloguj</LinkButton>
                </div>
            </div>
            <div
                className="min-h-screen relative grid items-center justify-center p-4"
                style={{ gridTemplateRows: '1fr' }}
                id="readme"
            >
                <Panel title="Czym jest QrContest?" className="text-justify mb-12">
                    <p className="pt-1">QrContest to konkurs, który polega na odkrywaniu i skanowaniu kodów QR
                        rozsianych po terenie konwentu. Za każdy zebrany kod otrzymasz punkty, a im więcej punktów
                        zgromadzisz, tym wyżej znajdziesz się w rankingu. Miejsce na podium gwarantuje fantastyczną
                        nagrodę!</p>
                    <p className="pt-4">Konkurs składa się z dwóch etapów, a punkty zdobyte w pierwszym etapie przenoszą
                        się do drugiego. Troje uczestników z największą ilością punktów na koniec każdego etapu otrzyma
                        cenne nagrody!</p>
                    <p className="pt-4">Udział w konkursie jest całkowicie darmowy. Wszystko, czego potrzebujesz, to
                        smartfon z dostępem
                        do internetu.</p>
                    <p className="pt-4">Pytania? Kliknij tutaj.</p>
                    <Button className="w-full mt-4">Pytania i odpowiedzi</Button>
                </Panel>
            </div>
        </main>
    );
}

