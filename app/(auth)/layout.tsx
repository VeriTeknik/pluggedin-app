'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useThemeLogo } from '@/hooks/use-theme-logo';

// Types for our network
type ModelNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number;
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
  type: 'main' | 'sub';
  parentId?: string;
  isHovered?: boolean;
  isDragging?: boolean;
};

type Connection = {
  from: string;
  to: string;
  strength: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  connectionId: string;
};

function NetworkAnimation() {
  const [nodes, setNodes] = useState<ModelNode[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [time, setTime] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Define main AI models
  const mainModels = useMemo(() => [
    { id: 'gpt', name: 'GPT' },
    { id: 'claude', name: 'Claude' },
    { id: 'llama', name: 'Llama' },
    { id: 'palm', name: 'PaLM' },
    { id: 'gemini', name: 'Gemini' },
    { id: 'mistral', name: 'Mistral' }
  ], []);

  // Mouse event handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (draggedNode) {
      setNodes(prev => prev.map(node => {
        if (node.id === draggedNode) {
          return {
            ...node,
            targetX: x,
            targetY: y,
          };
        }
        return node;
      }));
    }
  }, [draggedNode]);

  const handleMouseDown = useCallback((nodeId: string) => {
    setDraggedNode(nodeId);
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, isDragging: true } : node
    ));
  }, []);

  const handleMouseUp = useCallback(() => {
    if (draggedNode) {
      setNodes(prev => prev.map(node => 
        node.id === draggedNode ? { ...node, isDragging: false } : node
      ));
    }
    setDraggedNode(null);
  }, [draggedNode]);

  const handleMouseEnter = useCallback((nodeId: string) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, isHovered: true } : node
    ));
  }, []);

  const handleMouseLeave = useCallback((nodeId: string) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, isHovered: false } : node
    ));
  }, []);

  // Initialize nodes
  const initializeNodes = useCallback(() => {
    if (!dimensions.width || !dimensions.height) return;

    const center = {
      x: dimensions.width / 2,
      y: dimensions.height / 2
    };

    const mainOrbitRadius = Math.min(dimensions.width, dimensions.height) * 0.25;
    const subOrbitRadius = mainOrbitRadius * 0.4;
    
    const newNodes: ModelNode[] = [];

    // Add main model nodes
    mainModels.forEach((model, i) => {
      const angle = (i * 2 * Math.PI) / mainModels.length;
      const x = center.x + Math.cos(angle) * mainOrbitRadius;
      const y = center.y + Math.sin(angle) * mainOrbitRadius;
      newNodes.push({
        id: model.id,
        name: model.name,
        x,
        y,
        targetX: x,
        targetY: y,
        radius: 20,
        angle,
        orbitRadius: mainOrbitRadius,
        orbitSpeed: 0.0002,
        type: 'main'
      });

      // Add sub-nodes for each main model
      const subNodesCount = 3;
      for (let j = 0; j < subNodesCount; j++) {
        const subAngle = angle + ((j * 2 * Math.PI) / subNodesCount);
        const subX = x + Math.cos(subAngle) * subOrbitRadius;
        const subY = y + Math.sin(subAngle) * subOrbitRadius;
        newNodes.push({
          id: `${model.id}-sub-${j}`,
          name: `${model.name} ${j + 1}`,
          x: subX,
          y: subY,
          targetX: subX,
          targetY: subY,
          radius: 8,
          angle: subAngle,
          orbitRadius: subOrbitRadius,
          orbitSpeed: 0.0004,
          type: 'sub',
          parentId: model.id
        });
      }
    });

    setNodes(newNodes);
  }, [dimensions, mainModels]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      const container = document.querySelector('.network-container');
      if (container) {
        setDimensions({
          width: container.clientWidth,
          height: container.clientHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Initialize nodes when dimensions change
  useEffect(() => {
    initializeNodes();
  }, [dimensions, initializeNodes]);

  // Particle system
  const createParticle = useCallback((x: number, y: number, targetX: number, targetY: number, connectionId: string) => {
    const angle = Math.atan2(targetY - y, targetX - x);
    const speed = 2;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      connectionId
    };
  }, []);

  // Animate nodes and particles
  useEffect(() => {
    if (!nodes.length) return;

    const animate = () => {
      setTime(t => t + 1);
      
      // Update nodes
      setNodes(prevNodes => {
        const center = {
          x: dimensions.width / 2,
          y: dimensions.height / 2
        };

        return prevNodes.map(node => {
          if (node.isDragging) {
            // If being dragged, move towards mouse position with spring effect
            const dx = node.targetX - node.x;
            const dy = node.targetY - node.y;
            return {
              ...node,
              x: node.x + dx * 0.2,
              y: node.y + dy * 0.2
            };
          } else if (node.type === 'main') {
            // Rotate main nodes around center
            const newAngle = node.angle + node.orbitSpeed;
            const targetX = center.x + Math.cos(newAngle) * node.orbitRadius;
            const targetY = center.y + Math.sin(newAngle) * node.orbitRadius;
            // Add spring effect
            const dx = targetX - node.x;
            const dy = targetY - node.y;
            return {
              ...node,
              angle: newAngle,
              x: node.x + dx * 0.1,
              y: node.y + dy * 0.1,
              targetX,
              targetY
            };
          } else {
            // Find parent node
            const parent = prevNodes.find(n => n.id === node.parentId);
            if (!parent) return node;

            // Rotate sub nodes around their parent with spring effect
            const newAngle = node.angle + node.orbitSpeed;
            const targetX = parent.x + Math.cos(newAngle) * node.orbitRadius;
            const targetY = parent.y + Math.sin(newAngle) * node.orbitRadius;
            const dx = targetX - node.x;
            const dy = targetY - node.y;
            return {
              ...node,
              angle: newAngle,
              x: node.x + dx * 0.1,
              y: node.y + dy * 0.1,
              targetX,
              targetY
            };
          }
        });
      });

      // Update particles
      setParticles(prevParticles => {
        // Remove dead particles
        const filtered = prevParticles.filter(p => p.life > 0);
        
        // Add new particles
        const connections = nodes.flatMap(node => {
          if (node.type === 'main') {
            // Add particles from center to main nodes
            if (Math.random() < 0.1) {
              filtered.push(createParticle(
                dimensions.width / 2,
                dimensions.height / 2,
                node.x,
                node.y,
                `center-${node.id}`
              ));
            }
            
            // Add particles from main nodes to sub nodes
            const subNodes = nodes.filter(n => n.parentId === node.id);
            subNodes.forEach(subNode => {
              if (Math.random() < 0.05) {
                filtered.push(createParticle(
                  node.x,
                  node.y,
                  subNode.x,
                  subNode.y,
                  `${node.id}-${subNode.id}`
                ));
              }
            });
          }
          return [];
        });

        // Update particle positions and life
        return filtered.map(particle => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          life: particle.life - 0.02
        }));
      });
    };

    const intervalId = setInterval(animate, 16);
    return () => clearInterval(intervalId);
  }, [nodes, dimensions, createParticle]);

  if (!dimensions.width || !dimensions.height) return null;

  // Calculate connections
  const connections: Connection[] = [];
  nodes.forEach(node => {
    if (node.type === 'main') {
      // Connect main nodes to center
      connections.push({
        from: 'center',
        to: node.id,
        strength: 1
      });
      
      // Connect main nodes to their sub nodes
      const subNodes = nodes.filter(n => n.parentId === node.id);
      subNodes.forEach(subNode => {
        connections.push({
          from: node.id,
          to: subNode.id,
          strength: 0.7
        });
      });
    }
  });

  return (
    <svg 
      ref={svgRef}
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <defs>
        <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.1">
            <animate
              attributeName="stopOpacity"
              values="0.1; 0.3; 0.1"
              dur="2s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.3">
            <animate
              attributeName="stopOpacity"
              values="0.3; 0.6; 0.3"
              dur="2s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.1">
            <animate
              attributeName="stopOpacity"
              values="0.1; 0.3; 0.1"
              dur="2s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>
        
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Draw base connections */}
      {connections.map(conn => {
        const fromNode = conn.from === 'center' 
          ? { x: dimensions.width / 2, y: dimensions.height / 2 }
          : nodes.find(n => n.id === conn.from);
        const toNode = nodes.find(n => n.id === conn.to);

        if (!fromNode || !toNode) return null;

        return (
          <line
            key={`${conn.from}-${conn.to}`}
            x1={fromNode.x}
            y1={fromNode.y}
            x2={toNode.x}
            y2={toNode.y}
            className="stroke-current"
            strokeWidth={conn.strength}
            strokeOpacity={0.1}
            stroke="url(#connectionGradient)"
          />
        );
      })}

      {/* Draw particles */}
      {particles.map((particle, i) => (
        <circle
          key={`particle-${i}`}
          cx={particle.x}
          cy={particle.y}
          r={2}
          className="fill-primary"
          opacity={particle.life}
          filter="url(#glow)"
        />
      ))}

      {/* Draw nodes */}
      {nodes.map(node => (
        <g 
          key={node.id}
          onMouseDown={() => handleMouseDown(node.id)}
          onMouseEnter={() => handleMouseEnter(node.id)}
          onMouseLeave={() => handleMouseLeave(node.id)}
          className="cursor-pointer"
          style={{
            transform: `translate(${node.x}px, ${node.y}px)`,
            transition: 'transform 0.1s ease-out'
          }}
        >
          <circle
            r={node.radius * (node.isHovered ? 1.2 : 1)}
            className={`
              transition-all duration-200
              ${node.type === 'main' 
                ? 'fill-primary/30 stroke-primary/50' 
                : 'fill-muted-foreground/20 stroke-muted-foreground/30'}
              ${node.isHovered ? 'filter-glow' : ''}
            `}
            strokeWidth="2"
            filter={node.isHovered ? "url(#glow)" : undefined}
          >
            <animate
              attributeName="r"
              values={`${node.radius};${node.radius * 1.1};${node.radius}`}
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>
          {node.type === 'main' && (
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              className={`
                fill-primary text-xs font-medium
                transition-all duration-200
                ${node.isHovered ? 'font-bold' : ''}
              `}
              style={{
                fontSize: node.isHovered ? '0.9rem' : '0.75rem'
              }}
            >
              {node.name}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { logoSrc } = useThemeLogo();
  const [mounted, setMounted] = useState(false);

  const desktopLogoWidth = 180;
  const desktopLogoHeight = 90;
  const mobileLogoWidth = 140;
  const mobileLogoHeight = 70;

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <div className="hidden md:flex bg-muted items-center justify-center p-8 relative overflow-hidden network-container">
        <div className="absolute inset-0">
          <NetworkAnimation />
        </div>
        <div className="relative z-10 flex flex-col items-center">
          {mounted ? (
            <div className="bg-background/80 backdrop-blur-sm rounded-full p-6">
              <Image
                src={logoSrc}
                alt="Plugged.in Logo"
                width={desktopLogoWidth}
                height={desktopLogoHeight}
                className="mx-auto"
              />
            </div>
          ) : (
            <div 
              style={{ 
                width: `${desktopLogoWidth}px`, 
                height: `${desktopLogoHeight}px` 
              }} 
              className="mx-auto" 
            />
          )}
          
          <p className="text-center mt-4 text-muted-foreground font-medium">
            The AI crossroads.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8 relative">
        <div className="max-w-md w-full">
          <div className="md:hidden flex justify-center mb-8 relative">
            <div className="absolute inset-0">
              <NetworkAnimation />
            </div>
            <div className="relative z-10">
              {mounted ? (
                <div className="bg-background/80 backdrop-blur-sm rounded-full p-4">
                  <Image
                    src={logoSrc}
                    alt="Plugged.in Logo"
                    width={mobileLogoWidth}
                    height={mobileLogoHeight}
                    className="mx-auto"
                  />
                </div>
              ) : (
                <div 
                  style={{ 
                    width: `${mobileLogoWidth}px`, 
                    height: `${mobileLogoHeight}px` 
                  }} 
                  className="mx-auto" 
                />
              )}
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
} 