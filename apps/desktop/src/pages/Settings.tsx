import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchPreferences } from '@/components/settings/SearchPreferences';
import { ScheduleSettings } from '@/components/settings/ScheduleSettings';
import { SourcesSettings } from '@/components/settings/SourcesSettings';
import { ApiKeysSettings } from '@/components/settings/ApiKeysSettings';
import { AboutSettings } from '@/components/settings/AboutSettings';

const tabTriggerClass = "text-[13px] px-3 py-2.5 rounded-none shadow-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-foreground";

export function Settings() {
  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="search" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-border px-5">
          <TabsList className="h-auto bg-transparent p-0 rounded-none">
            <TabsTrigger value="search" className={tabTriggerClass}>Search</TabsTrigger>
            <TabsTrigger value="schedule" className={tabTriggerClass}>Schedule</TabsTrigger>
            <TabsTrigger value="sources" className={tabTriggerClass}>Sources</TabsTrigger>
            <TabsTrigger value="api-keys" className={tabTriggerClass}>API Keys</TabsTrigger>
            <TabsTrigger value="about" className={tabTriggerClass}>About</TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="flex-1">
          <div className="max-w-2xl mx-auto px-6 py-4">
            <TabsContent value="search" className="mt-0"><SearchPreferences /></TabsContent>
            <TabsContent value="schedule" className="mt-0"><ScheduleSettings /></TabsContent>
            <TabsContent value="sources" className="mt-0"><SourcesSettings /></TabsContent>
            <TabsContent value="api-keys" className="mt-0"><ApiKeysSettings /></TabsContent>
            <TabsContent value="about" className="mt-0"><AboutSettings /></TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
