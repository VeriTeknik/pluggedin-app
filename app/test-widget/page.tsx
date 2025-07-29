export default function TestWidgetPage() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">Embedded Chat Widget Test</h1>
      <p className="mb-4">This page tests the embedded chat widget.</p>
      
      <div className="bg-gray-100 p-4 rounded">
        <p className="text-sm text-gray-600 mb-2">
          To test the widget, you need to:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Enable embedded chat in your project settings</li>
          <li>Copy the embed code from the Embedded Chat configuration</li>
          <li>Add the script tag to this page or use the browser console</li>
        </ol>
      </div>
      
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-2">Sample content</h2>
        <p className="text-gray-600">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor 
          incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud 
          exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
        </p>
      </div>
    </div>
  );
}