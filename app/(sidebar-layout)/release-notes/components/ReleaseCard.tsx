'use client';

import { AlertTriangle, BookText, Bug, GitCommit, GitPullRequest, Rocket, Zap } from 'lucide-react'; // Import icons & AlertTriangle
import { useTranslation } from 'react-i18next';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import type { ReleaseChange, ReleaseNote } from '@/types/release';

interface ReleaseCardProps {
  release: ReleaseNote;
}

// Helper function to get color and icon based on change type
const getChangeTypeStyle = (type: ReleaseChange['type']) => {
  switch (type) {
    case 'Feature':
      return { color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300', icon: <Rocket className="h-3.5 w-3.5 mr-1.5" /> };
    case 'Bug Fix':
      return { color: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300', icon: <Bug className="h-3.5 w-3.5 mr-1.5" /> };
    case 'Performance Improvement':
      return { color: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300', icon: <Zap className="h-3.5 w-3.5 mr-1.5" /> };
    case 'Breaking Change':
      return { color: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300', icon: <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> }; // Re-use AlertTriangle
    case 'Other':
    default:
      return { color: 'bg-gray-100 dark:bg-gray-700/50 text-gray-800 dark:text-gray-300', icon: <BookText className="h-3.5 w-3.5 mr-1.5" /> };
  }
};

export function ReleaseCard({ release }: ReleaseCardProps) {
  const { t } = useTranslation();

  const renderChanges = (changes: ReleaseChange[] | undefined, type: ReleaseChange['type']) => {
    if (!changes || changes.length === 0) return null;

    const { color, icon } = getChangeTypeStyle(type);

    return (
      <div className="mb-4 last:mb-0">
        <h4 className={`text-sm font-semibold mb-2 flex items-center px-2 py-1 rounded-t-md ${color}`}>
          {icon}
          {t(`releaseNotes.changeTypes.${type.toLowerCase().replace(/ /g, '')}`, type)} ({changes.length})
        </h4>
        <ul className="list-disc space-y-1 pl-6 text-sm border border-t-0 rounded-b-md p-3 bg-muted/30 dark:border-slate-700">
          {changes.map((change, index) => (
            <li key={index} className="text-muted-foreground">
              {change.message}
              {change.commitUrl && (
                <a
                  href={change.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-blue-600 hover:underline dark:text-blue-400"
                  title={t('releaseNotes.viewCommit', 'View Commit')}
                >
                  <GitCommit className="inline h-3.5 w-3.5" />
                </a>
              )}
               {/* TODO: Display contributors if available */}
               {/* {change.contributors && change.contributors.length > 0 && (
                 <span className="text-xs ml-2">(by {change.contributors.join(', ')})</span>
               )} */}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const hasContent = release.content && Object.values(release.content).some(arr => arr && arr.length > 0);

  return (
    <Accordion type="single" collapsible className="w-full border rounded-lg shadow-sm dark:border-slate-800 bg-card">
      <AccordionItem value={release.version} className="border-b-0">
        <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 rounded-t-lg dark:hover:bg-slate-800/50">
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{release.version}</Badge>
              <span className="text-sm font-medium text-muted-foreground">
                {new Date(release.releaseDate).toLocaleDateString()}
              </span>
              <Badge variant="outline" className="text-xs capitalize">
                {release.repository.replace('pluggedin-', '')} {/* Simple display */}
              </Badge>
            </div>
            {/* Optional: Add a "What's New" badge logic here */}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-3 pb-4 border-t dark:border-slate-800">
          {hasContent ? (
            <>
              {renderChanges(release.content.features, 'Feature')}
              {renderChanges(release.content.bugFixes, 'Bug Fix')}
              {renderChanges(release.content.performanceImprovements, 'Performance Improvement')}
              {renderChanges(release.content.breakingChanges, 'Breaking Change')}
              {renderChanges(release.content.otherChanges, 'Other')}
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {t('releaseNotes.noDetails', 'No specific changes listed for this release.')}
            </p>
          )}
          {/* Link to the release tag/commit on GitHub */}
           <div className="mt-4 text-xs text-muted-foreground">
             <a
               href={`https://github.com/${REPO_OWNER}/${release.repository}/releases/tag/${release.version}`} // Adjust if URL structure differs
               target="_blank"
               rel="noopener noreferrer"
               className="hover:underline flex items-center"
             >
               <GitPullRequest className="h-3 w-3 mr-1" />
               {t('releaseNotes.viewOnGitHub', 'View release on GitHub')} ({release.commitSha.substring(0, 7)})
             </a>
           </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// Define REPO_OWNER locally as it's not imported
const REPO_OWNER = 'VeriTeknik';

// Add missing translation keys to en.json if needed:
// "releaseNotes.changeTypes.feature": "Features"
// "releaseNotes.changeTypes.bugfix": "Bug Fixes"
// "releaseNotes.changeTypes.performanceimprovement": "Performance Improvements"
// "releaseNotes.changeTypes.breakingchange": "Breaking Changes"
// "releaseNotes.changeTypes.other": "Other Changes"
// "releaseNotes.viewCommit": "View Commit"
// "releaseNotes.noDetails": "No specific changes listed for this release."
// "releaseNotes.viewOnGitHub": "View release on GitHub"
