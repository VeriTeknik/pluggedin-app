import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { reserveUsername } from '@/app/actions/social';
import { Profile } from '@/types/profile';

interface UsernameSettingsProps {
  profile: Profile;
}

export function UsernameSettings({ profile }: UsernameSettingsProps) {
  const router = useRouter();
  const [username, setUsername] = useState(profile.username || '');
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

    try {
      const result = await reserveUsername(profile.uuid, username);
      if (result.success) {
        setSuccess('Username successfully reserved!');
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
        <p>
          Your public profile will be available at:{' '}
          <span className="font-medium text-foreground">
            plugged.in/to/{username || 'your-username'}
          </span>
        </p>
      </CardFooter>
    </Card>
  );
} 