import Image from 'next/image';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <div className="hidden md:flex bg-muted items-center justify-center p-8">
        <div className="max-w-md">
          <Image
            src="/pluggedin-wl-black.png"
            alt="Plugged.in Logo"
            width={200}
            height={100}
            className="mx-auto"
          />
          
          <p className="text-center mt-2 text-muted-foreground">
            The AI crossroads.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="md:hidden flex justify-center mb-8">
            <Image
              src="/pluggedin-wl-black.png"
              alt="Plugged.in Logo"
              width={150}
              height={75}
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
} 