import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Not in Tauri');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export function ApiKeysSettings() {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [adzunaAppId, setAdzunaAppId] = useState('');
  const [adzunaKey, setAdzunaKey] = useState('');
  const [hasAnthropic, setHasAnthropic] = useState(false);
  const [hasAdzuna, setHasAdzuna] = useState(false);

  useEffect(() => {
    async function checkKeys() {
      try {
        const anthKey = await tauriInvoke<string | null>('get_credential', {
          service: 'anthropic_api_key',
        });
        setHasAnthropic(!!anthKey);
        const adzId = await tauriInvoke<string | null>('get_credential', {
          service: 'adzuna_app_id',
        });
        setHasAdzuna(!!adzId);
      } catch {
        // Not running in Tauri context (browser dev)
      }
    }
    checkKeys();
  }, []);

  const pushKeys = async () => {
    if (isTauri()) {
      await tauriInvoke('push_keys_to_sidecar');
    } else {
      const { apiPost } = await import('@/lib/api');
      await apiPost('/internal/keys', { anthropicKey, adzunaAppId, adzunaKey });
    }
  };

  const saveAnthropicKey = async () => {
    try {
      if (isTauri()) {
        await tauriInvoke('store_credential', { service: 'anthropic_api_key', key: anthropicKey });
      }
      await pushKeys();
      setHasAnthropic(true);
      setAnthropicKey('');
      toast.success('Anthropic API key saved');
    } catch {
      toast.error('Failed to save key');
    }
  };

  const saveAdzunaKeys = async () => {
    try {
      if (isTauri()) {
        await tauriInvoke('store_credential', { service: 'adzuna_app_id', key: adzunaAppId });
        await tauriInvoke('store_credential', { service: 'adzuna_api_key', key: adzunaKey });
      }
      await pushKeys();
      setHasAdzuna(true);
      setAdzunaAppId('');
      setAdzunaKey('');
      toast.success('Adzuna API keys saved');
    } catch {
      toast.error('Failed to save keys');
    }
  };

  return (
    <div className="space-y-6 pt-4">
      {!isTauri() && (
        <Card className="border-yellow-500/30">
          <CardContent className="pt-4">
            <p className="text-xs text-amber-600 dark:text-yellow-400">
              API key storage requires the Tauri desktop shell. Keys are stored in your OS keychain.
              In browser dev mode, push keys directly to the sidecar via the internal API.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Anthropic API Key</CardTitle>
          <CardDescription>
            Required for AI analysis. Get a key at console.anthropic.com
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="anthropic-key">API Key</Label>
              <Input
                id="anthropic-key"
                type="password"
                placeholder={hasAnthropic ? '••••••••••••••••' : 'sk-ant-...'}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
              />
            </div>
            <Button onClick={saveAnthropicKey} disabled={!anthropicKey}>
              {hasAnthropic ? 'Update' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adzuna API</CardTitle>
          <CardDescription>
            Required for Adzuna job source. Get free keys at developer.adzuna.com
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="adzuna-app-id">App ID</Label>
            <Input
              id="adzuna-app-id"
              placeholder={hasAdzuna ? '••••••••' : 'Your App ID'}
              value={adzunaAppId}
              onChange={(e) => setAdzunaAppId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adzuna-key">API Key</Label>
            <Input
              id="adzuna-key"
              type="password"
              placeholder={hasAdzuna ? '••••••••••••••••' : 'Your API Key'}
              value={adzunaKey}
              onChange={(e) => setAdzunaKey(e.target.value)}
            />
          </div>
          <Button onClick={saveAdzunaKeys} disabled={!adzunaAppId || !adzunaKey}>
            {hasAdzuna ? 'Update' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
