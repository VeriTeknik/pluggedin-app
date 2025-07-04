'use client';

import { useState } from 'react';

import { IntelligentServerDialog } from '@/components/intelligent-server-dialog';

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