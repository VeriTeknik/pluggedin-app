-- Seed the is.plugged.in cluster for PAP heartbeat collector integration
INSERT INTO clusters (cluster_id, name, description, collector_url, status)
VALUES (
  'is.plugged.in',
  'Production Cluster (is.plugged.in)',
  'Main production cluster for PAP agents',
  'https://collector.is.plugged.in',
  'ACTIVE'
)
ON CONFLICT (cluster_id) DO UPDATE SET
  collector_url = 'https://collector.is.plugged.in',
  name = 'Production Cluster (is.plugged.in)';
