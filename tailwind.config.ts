import type { Config } from "tailwindcss";
import tailwindTypography from "@tailwindcss/typography";

export default {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	container: {
  		center: true,
  		padding: "2rem",
  		screens: {
  			"2xl": "1400px",
  		},
  	},
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			// Enterprise color palette
  			'tech-blue': {
  				50: '#EBF5FF',
  				100: '#E1EFFE',
  				500: '#1E40AF',
  				600: '#1E3A8A',
  				700: '#1E3A8A',
  				800: '#1E3078',
  				900: '#0F172A',
  			},
  			'electric-cyan': '#06B6D4',
  			'neon-purple': '#9333EA',
  			'glow-green': '#10B981',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'gradient-shift': {
  				'0%': { backgroundPosition: '0% 50%' },
  				'50%': { backgroundPosition: '100% 50%' },
  				'100%': { backgroundPosition: '0% 50%' },
  			},
  			'pulse-glow': {
  				'0%, 100%': {
  					boxShadow: '0 0 20px rgba(6, 182, 212, 0.5)',
  					transform: 'scale(1)'
  				},
  				'50%': {
  					boxShadow: '0 0 40px rgba(6, 182, 212, 0.8)',
  					transform: 'scale(1.05)'
  				},
  			},
  			'float': {
  				'0%, 100%': { transform: 'translateY(0px)' },
  				'50%': { transform: 'translateY(-20px)' },
  			},
  			'slide-up': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(30px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				},
  			},
  			'fade-in': {
  				from: { opacity: '0' },
  				to: { opacity: '1' },
  			},
  			'shimmer': {
  				'0%': { backgroundPosition: '-1000px 0' },
  				'100%': { backgroundPosition: '1000px 0' },
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'gradient-shift': 'gradient-shift 8s ease infinite',
  			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
  			'float': 'float 6s ease-in-out infinite',
  			'slide-up': 'slide-up 0.5s ease-out',
  			'fade-in': 'fade-in 0.5s ease-out',
  			'shimmer': 'shimmer 2s linear infinite',
  		},
  		backgroundSize: {
  			'300%': '300%',
  		},
  		backdropFilter: {
  			'glass': 'blur(10px)',
  		}
  	}
  },
  plugins: [
    require("tailwindcss-animate"),
    tailwindTypography,
  ],
} satisfies Config;
