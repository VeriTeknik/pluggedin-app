'use client';

import { IntelligentServerDialog } from '@/components/intelligent-server-dialog';
import { useState } from 'react';

export default function TestPage() {
  const [showAddServerWizard, setShowAddServerWizard] = useState(false);
  
  return (
    <div>
      <IntelligentServerDialog 
        open={showAddServerWizard} 
        onOpenChange={setShowAddServerWizard}
        onSubmit={() => {}}
        profileUuid="test"
        existingServers={[]}
      />
    </div>
  );
}