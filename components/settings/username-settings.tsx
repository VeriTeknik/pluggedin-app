'use client';

import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// No longer need Session type import
import { reserveUsername } from '@/app/actions/social';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// No longer need useAuth hook here if userId is passed as prop
// import { useAuth } from '@/hooks/use-auth'; 

interface UsernameSettingsProps {
  initialUsername?: string | null;
  userId: string; // Expect userId as a prop
}

export function UsernameSettings({ initialUsername, userId }: UsernameSettingsProps) {
  const router = useRouter();
  // const { session } = useAuth(); // Remove useAuth hook usage
  const currentUserId = userId; // Use the passed userId prop
  const [username, setUsername] = useState(initialUsername || '');
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    setIsAvailable(null);
    setMessage(null);
    setError(null);
    setSuccess(null);
  };

  const checkAvailability = async () => {
    if (!username.trim()) {
      setIsAvailable(false);
      setMessage('Username cannot be empty');
      return;
    }

    setIsChecking(true);
    try {
      // Assuming the API route exists and works correctly
      const response = await fetch(`/api/check-username?username=${encodeURIComponent(username)}`);
      const data = await response.json();
      setIsAvailable(data.available);
      setMessage(data.message || null);
    } catch (err) {
      setIsAvailable(false);
      setMessage('Failed to check username availability');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    if (!currentUserId) {
       setError('User not identified. Cannot reserve username.');
       setIsSubmitting(false);
       return;
    }

    try {
      const result = await reserveUsername(currentUserId, username);
      if (result.success && result.user) {
        setSuccess('Username successfully reserved!');
        setUsername(result.user.username || ''); // Update local state with saved username
        router.refresh();
      } else {
        setError(result.error || 'Failed to reserve username');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Username</CardTitle>
        <CardDescription>
          Set your unique username for your public profile at plugged.in/to/username
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <div className="flex gap-2">
                <Input
                  id="username"
                  placeholder="your-username"
                  value={username}
                  onChange={handleUsernameChange}
                  disabled={isSubmitting}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={checkAvailability}
                  disabled={isChecking || isSubmitting}
                >
                  {isChecking ? 'Checking...' : 'Check'}
                </Button>
              </div>
              {isAvailable !== null && (
                <div className="flex items-center gap-2 mt-2">
                  {isAvailable ? (
                    <>
                      <Check className="h-4 w-4 text-green-500" />
                      <span className="text-green-500 text-sm">Username is available</span>
                    </>
                  ) : (
                    <>
                      <X className="h-4 w-4 text-red-500" />
                      <span className="text-red-500 text-sm">{message || 'Username is not available'}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
          </div>
          <Button
            type="submit"
            className="mt-4"
            disabled={!isAvailable || isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Username'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="border-t pt-6 text-sm text-muted-foreground">
        {username ? (
           <p>
             Your public profile is available at:{' '}
             <Link href={`/to/${username}`} target="_blank" className="font-medium text-primary hover:underline">
               plugged.in/to/{username}
             </Link>
           </p>
        ) : (
           <p>Set a username above to create your public profile URL.</p>
        )}
      </CardFooter>
    </Card>
  );
}
