/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                primary: {
                    DEFAULT: "#F97316", // Orange-500
                    foreground: "#FFFFFF",
                },
                secondary: {
                    DEFAULT: "#10B981", // Emerald-500
                    foreground: "#FFFFFF",
                },
                destructive: {
                    DEFAULT: "#EF4444", // Red-500
                    foreground: "#FFFFFF",
                },
                category: {
                    medication: "#F97316",
                    appointments: "#14b8a6", // Teal
                    water: "#3b82f6", // Blue
                    exercise: "#22c55e", // Green
                }
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
        },
    },
    plugins: [],
}
