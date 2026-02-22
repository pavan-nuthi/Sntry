/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                warm: {
                    50: '#FDFBF7',
                    100: '#F7F4EB',
                    200: '#EBE7DE',
                    300: '#DBD6C9',
                    400: '#C7BFA5',
                    500: '#B3A98B',
                    600: '#9F9677',
                    700: '#8B8369',
                    800: '#776F5B',
                    900: '#635B4D',
                },
                peach: {
                    50: '#FFF5F2',
                    100: '#FFE8DF',
                    200: '#FFD1C2',
                    400: '#FB923C',
                    500: '#E57A22',
                    600: '#D16E1E',
                    700: '#BD621A',
                    800: '#A95616',
                    900: '#954A12',
                },
            },
        },
    },
    plugins: [],
}
