/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async rewrites () {
        return [
            {
                source: '/collect/:code',
                destination: '/collect'
            },
            {
                source: '/collection/:cardId',
                destination: '/collection'
            },
            {
                source: '/clue/:cardId',
                destination: '/clue'
            },
            {
                source: '/admin/user/:uid',
                destination: '/admin/user'
            }
        ];
    }
};

module.exports = nextConfig;
