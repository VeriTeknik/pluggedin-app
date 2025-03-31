'use client'; // Required for Swagger UI component

import 'swagger-ui-react/swagger-ui.css'; // Import default styles

import React from 'react';
import SwaggerUI from 'swagger-ui-react';
import useSWR from 'swr';

// Fetcher function for SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

const ApiDocsPage: React.FC = () => {
  // Fetch the OpenAPI spec from our API route
  const { data: spec, error, isLoading } = useSWR('/api/docs', fetcher);

  if (isLoading) {
    return <div>Loading API Documentation...</div>;
  }

  if (error) {
    console.error("Error fetching API spec:", error);
    return <div>Error loading API Documentation. Please check the console.</div>;
  }

  if (!spec) {
    return <div>API Documentation not available.</div>;
  }

  // Render the Swagger UI component with the fetched spec
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">API Documentation</h1>
      <div className="bg-background rounded-lg shadow-md overflow-hidden">
        {/* Apply some basic styling adjustments if needed */}
        <style jsx global>{`
          .swagger-ui .topbar { display: none; } /* Hide the default top bar */
          .swagger-ui { padding: 1rem; }
        `}</style>
        <SwaggerUI spec={spec} />
      </div>
    </div>
  );
};

export default ApiDocsPage;
