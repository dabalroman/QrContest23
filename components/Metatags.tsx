import Head from 'next/head';

export default function Metatags({
    title = '',
    description = 'QrContest - Fantasmagoria 14',
    image = '',
}) {
    return (
        <Head>
            <title>{title ? `${title} - QrContest - Fantasmagoria 14` : 'QrContest - Fantasmagoria 14'}</title>

            <meta name="description" content={description}/>

            <meta name="twitter:card" content="summary" />
            <meta name="twitter:site" content="@fireship_dev" />
            <meta name="twitter:title" content='QrContest - Fantasmagoria 14' />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />

            <meta property="og:title" content='QrContest - Fantasmagoria 14' />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />

            <meta name="viewport" content="width=device-width, initial-scale=1"/>
            <meta name="color-scheme" content="light only"/>
            <link rel="icon" href="/favicon.ico"/>
        </Head>
    );
}
