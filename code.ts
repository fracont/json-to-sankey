// Sankey Diagram Plugin for Figma

interface SankeyNode {
  id: string;
  label?: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

interface NodeLayout {
  id: string;
  label: string;
  x: number;
  y: number;
  height: number;
  level: number;
  value: number;
  percentage: number;
}

interface LinkLayout {
  source: string;
  target: string;
  value: number;
  sourceY: number;
  targetY: number;
  sourceHeight: number;
  targetHeight: number;
}

// Configuration
const CONFIG = {
  nodeWidth: 8,
  minNodePadding: 20, // Minimum padding between nodes
  labelHeight: 50, // Estimated height needed for label text
  labelTopMargin: 16, // Margin from top of node to label
  levelSpacing: 300,
  minNodeHeight: 20, // Increased minimum height to prevent nodes from being too small
  maxTotalHeight: 800, // Reduced maximum total height to make diagram more compact
  nodeColor: { r: 0.43, g: 0.65, b: 0.89 }, // #6EA6E2
  linkColor: { r: 0.918, g: 0.949, b: 0.980 }, // #EAF2FA
  linkOpacity: 1
};

figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  if (msg.type === 'generate-sankey') {
    try {
      const sankeyData: SankeyData = msg.data;
      await generateSankeyDiagram(sankeyData);
      figma.notify('Sankey diagram generated successfully!');
      figma.closePlugin();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      figma.notify(`Error: ${errorMessage}`, { error: true });
    }
  }
};

async function generateSankeyDiagram(data: SankeyData) {
  // Calculate node levels (columns)
  const nodeLevels = calculateNodeLevels(data);

  // Calculate value scale for normalization
  const valueScale = calculateValueScale(data, nodeLevels);

  // Calculate node values based on total flow
  const nodeValues: Record<string, number> = {};
  for (const node of data.nodes) {
    const incomingValue = data.links
      .filter(link => link.target === node.id)
      .reduce((sum, link) => sum + link.value, 0);
    const outgoingValue = data.links
      .filter(link => link.source === node.id)
      .reduce((sum, link) => sum + link.value, 0);
    nodeValues[node.id] = Math.max(incomingValue, outgoingValue, 1);
  }

  // Calculate percentages relative to parent nodes
  const nodePercentages: Record<string, number> = {};

  for (const node of data.nodes) {
    // Find all incoming links to this node
    const incomingLinks = data.links.filter(link => link.target === node.id);

    if (incomingLinks.length === 0) {
      // Root node - 100%
      nodePercentages[node.id] = 100;
    } else {
      // Calculate total value of all parent nodes
      const totalParentValue = incomingLinks.reduce((sum, link) => {
        const sourceNode = data.nodes.find(n => n.id === link.source);
        if (!sourceNode) return sum;
        return sum + nodeValues[link.source];
      }, 0);

      // Percentage is the node's value relative to total parent value
      nodePercentages[node.id] = totalParentValue > 0
        ? (nodeValues[node.id] / totalParentValue) * 100
        : 100;
    }
  }

  // Calculate node positions and heights
  const nodeLayouts = calculateNodeLayouts(data, nodeLevels, valueScale, nodeValues, nodePercentages);

  // Calculate link positions
  const linkLayouts = calculateLinkLayouts(data, nodeLayouts, valueScale);

  // Create the diagram frame
  const frame = figma.createFrame();
  frame.name = 'Sankey Diagram';

  // Calculate frame dimensions
  const maxLevel = Math.max(...Object.values(nodeLevels));
  const frameWidth = (maxLevel + 1) * CONFIG.levelSpacing + CONFIG.nodeWidth + 300; // Extra space for labels
  const maxY = Math.max(...nodeLayouts.map(n => n.y + n.height));
  const frameHeight = maxY + 100;

  frame.resize(frameWidth, frameHeight);
  frame.x = figma.viewport.center.x - frameWidth / 2;
  frame.y = figma.viewport.center.y - frameHeight / 2;
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

  // Draw links first (so they appear behind nodes)
  for (const link of linkLayouts) {
    await createLink(frame, link, nodeLayouts);
  }

  // Draw nodes
  for (const node of nodeLayouts) {
    await createNode(frame, node, data);
  }

  // Select the created frame
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
}

function calculateNodeLevels(data: SankeyData): Record<string, number> {
  const levels: Record<string, number> = {};
  const visited = new Set<string>();

  // Find source nodes (nodes with no incoming links)
  const hasIncoming = new Set<string>();
  data.links.forEach(link => hasIncoming.add(link.target));

  const sourceNodes = data.nodes
    .map(n => n.id)
    .filter(id => !hasIncoming.has(id));

  // If no clear source nodes, start with the first node
  if (sourceNodes.length === 0) {
    sourceNodes.push(data.nodes[0].id);
  }

  // BFS to assign levels
  const queue: Array<{ id: string; level: number }> = sourceNodes.map(id => ({ id, level: 0 }));

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;

    if (visited.has(id)) continue;
    visited.add(id);

    levels[id] = level;

    // Find all targets from this node
    const targets = data.links
      .filter(link => link.source === id)
      .map(link => link.target);

    for (const target of targets) {
      if (!visited.has(target)) {
        queue.push({ id: target, level: level + 1 });
      }
    }
  }

  // Assign level 0 to any unvisited nodes
  data.nodes.forEach(node => {
    if (levels[node.id] === undefined) {
      levels[node.id] = 0;
    }
  });

  return levels;
}

function calculateValueScale(data: SankeyData, nodeLevels: Record<string, number>): number {
  // Group nodes by level
  const nodesByLevel: Record<number, string[]> = {};
  for (const [nodeId, level] of Object.entries(nodeLevels)) {
    if (!nodesByLevel[level]) nodesByLevel[level] = [];
    nodesByLevel[level].push(nodeId);
  }

  // Calculate node values based on total flow
  const nodeValues: Record<string, number> = {};

  for (const node of data.nodes) {
    const incomingValue = data.links
      .filter(link => link.target === node.id)
      .reduce((sum, link) => sum + link.value, 0);

    const outgoingValue = data.links
      .filter(link => link.source === node.id)
      .reduce((sum, link) => sum + link.value, 0);

    nodeValues[node.id] = Math.max(incomingValue, outgoingValue, 1);
  }

  // Find the maximum total value across all levels to normalize
  let maxLevelValue = 0;
  for (const nodeIds of Object.values(nodesByLevel)) {
    const levelTotal = nodeIds.reduce((sum, id) => sum + nodeValues[id], 0);
    maxLevelValue = Math.max(maxLevelValue, levelTotal);
  }

  // Calculate scale factor to fit within maxTotalHeight
  return maxLevelValue > 0 ? CONFIG.maxTotalHeight / maxLevelValue : 1;
}

function calculateNodeLayouts(
  data: SankeyData,
  nodeLevels: Record<string, number>,
  valueScale: number,
  nodeValues: Record<string, number>,
  nodePercentages: Record<string, number>
): NodeLayout[] {
  const layouts: NodeLayout[] = [];

  // Group nodes by level
  const nodesByLevel: Record<number, string[]> = {};
  for (const [nodeId, level] of Object.entries(nodeLevels)) {
    if (!nodesByLevel[level]) nodesByLevel[level] = [];
    nodesByLevel[level].push(nodeId);
  }

  // Build parent-child map
  const childrenOf: Record<string, string[]> = {};
  const parentsOf: Record<string, string[]> = {};
  
  for (const link of data.links) {
    if (!childrenOf[link.source]) childrenOf[link.source] = [];
    childrenOf[link.source].push(link.target);
    
    if (!parentsOf[link.target]) parentsOf[link.target] = [];
    parentsOf[link.target].push(link.source);
  }

  // Sort children by value within each parent
  for (const parentId in childrenOf) {
    childrenOf[parentId].sort((a, b) => nodeValues[b] - nodeValues[a]);
  }

  // Determine hierarchical ordering for each level
  const orderedNodesByLevel: Record<number, string[]> = {};
  const visited = new Set<string>();

  function collectDescendantsInOrder(nodeId: string, targetLevel: number, result: string[]) {
    const children = childrenOf[nodeId] || [];
    for (const childId of children) {
      const childLevel = nodeLevels[childId];
      if (childLevel === targetLevel && !visited.has(childId)) {
        visited.add(childId);
        result.push(childId);
      }
      // Recursively collect from this child's descendants
      collectDescendantsInOrder(childId, targetLevel, result);
    }
  }

  // For each level, determine the order
  const maxLevel = Math.max(...Object.values(nodeLevels));
  
  for (let level = 0; level <= maxLevel; level++) {
    const nodesInLevel = nodesByLevel[level] || [];
    const ordered: string[] = [];
    visited.clear();

    // Find root nodes at this level (no parents)
    const rootNodes = nodesInLevel.filter(nodeId => !parentsOf[nodeId] || parentsOf[nodeId].length === 0);
    rootNodes.sort((a, b) => nodeValues[b] - nodeValues[a]);

    // Add root nodes first
    for (const rootId of rootNodes) {
      if (!visited.has(rootId)) {
        visited.add(rootId);
        ordered.push(rootId);
      }
    }

    // For nodes with parents, collect them in hierarchical order
    // Start from nodes in previous levels
    if (level > 0) {
      const previousLevelNodes = nodesByLevel[level - 1] || [];
      for (const parentId of previousLevelNodes) {
        collectDescendantsInOrder(parentId, level, ordered);
      }
    }

    // Add any remaining nodes (in case of disconnected components)
    for (const nodeId of nodesInLevel) {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        ordered.push(nodeId);
      }
    }

    orderedNodesByLevel[level] = ordered;
  }

  // Position nodes level by level
  const nodeYPositions: Record<string, { y: number; height: number }> = {};
  
  for (let level = 0; level <= maxLevel; level++) {
    const orderedNodes = orderedNodesByLevel[level] || [];
    const x = level * CONFIG.levelSpacing + 50;
    const isLastLevel = level === maxLevel;

    if (!isLastLevel) {
      // Non-leaf levels: position compactly from top
      let currentY = 50;
      
      for (const nodeId of orderedNodes) {
        const node = data.nodes.find(n => n.id === nodeId)!;
        const value = nodeValues[nodeId];
        const height = Math.max(value * valueScale, CONFIG.minNodeHeight);
        const percentage = nodePercentages[nodeId];

        nodeYPositions[nodeId] = { y: currentY, height };

        layouts.push({
          id: nodeId,
          label: node.label || nodeId,
          x,
          y: currentY,
          height,
          level,
          value,
          percentage
        });

        const dynamicPadding = Math.max(
          CONFIG.minNodePadding,
          CONFIG.labelHeight - height / 2
        );

        currentY += height + dynamicPadding;
      }
    } else {
      // Last level (leafs): group by parent and center each group around its parent
      const leafsByParent: Record<string, string[]> = {};
      
      for (const leafId of orderedNodes) {
        const parents = parentsOf[leafId] || [];
        const primaryParent = parents[0]; // Use first parent as primary
        
        if (primaryParent) {
          if (!leafsByParent[primaryParent]) leafsByParent[primaryParent] = [];
          leafsByParent[primaryParent].push(leafId);
        }
      }

      let currentY = 50;

      // Process each parent's leafs
      for (const parentId of orderedNodesByLevel[level - 1] || []) {
        const leafs = leafsByParent[parentId] || [];
        if (leafs.length === 0) continue;

        const parentPos = nodeYPositions[parentId];
        if (!parentPos) continue;

        // Calculate total height of this group of leafs
        let groupHeight = 0;
        for (let i = 0; i < leafs.length; i++) {
          const leafId = leafs[i];
          const value = nodeValues[leafId];
          const height = Math.max(value * valueScale, CONFIG.minNodeHeight);
          groupHeight += height;
          
          if (i < leafs.length - 1) {
            const dynamicPadding = Math.max(
              CONFIG.minNodePadding,
              CONFIG.labelHeight - height / 2
            );
            groupHeight += dynamicPadding;
          }
        }

        // Calculate center position relative to parent
        const parentCenter = parentPos.y + parentPos.height / 2;
        let groupStartY = parentCenter - groupHeight / 2;
        
        // Ensure we don't overlap with previous groups
        groupStartY = Math.max(currentY, groupStartY);

        // Position each leaf in this group
        let leafY = groupStartY;
        for (const leafId of leafs) {
          const node = data.nodes.find(n => n.id === leafId)!;
          const value = nodeValues[leafId];
          const height = Math.max(value * valueScale, CONFIG.minNodeHeight);
          const percentage = nodePercentages[leafId];

          nodeYPositions[leafId] = { y: leafY, height };

          layouts.push({
            id: leafId,
            label: node.label || leafId,
            x,
            y: leafY,
            height,
            level,
            value,
            percentage
          });

          const dynamicPadding = Math.max(
            CONFIG.minNodePadding,
            CONFIG.labelHeight - height / 2
          );

          leafY += height + dynamicPadding;
        }

        currentY = leafY;
      }
    }
  }

  return layouts;
}

function calculateLinkLayouts(data: SankeyData, nodeLayouts: NodeLayout[], valueScale: number): LinkLayout[] {
  const linkLayouts: LinkLayout[] = [];

  // Track vertical position for each node's connections
  const nodeSourceOffsets: Record<string, number> = {};
  const nodeTargetOffsets: Record<string, number> = {};

  // Calculate total values for each node to determine proportions
  const nodeIncomingTotal: Record<string, number> = {};
  const nodeOutgoingTotal: Record<string, number> = {};

  nodeLayouts.forEach(node => {
    nodeSourceOffsets[node.id] = 0;
    nodeTargetOffsets[node.id] = 0;
    nodeIncomingTotal[node.id] = 0;
    nodeOutgoingTotal[node.id] = 0;
  });

  // Calculate totals
  for (const link of data.links) {
    nodeOutgoingTotal[link.source] = (nodeOutgoingTotal[link.source] || 0) + link.value;
    nodeIncomingTotal[link.target] = (nodeIncomingTotal[link.target] || 0) + link.value;
  }

  // Sort links to prevent crossing
  // For each source node, sort its outgoing links by target Y position
  // For each target node, sort its incoming links by source Y position
  const sortedLinks = [...data.links].sort((a, b) => {
    const sourceNodeA = nodeLayouts.find(n => n.id === a.source);
    const sourceNodeB = nodeLayouts.find(n => n.id === b.source);
    const targetNodeA = nodeLayouts.find(n => n.id === a.target);
    const targetNodeB = nodeLayouts.find(n => n.id === b.target);

    if (!sourceNodeA || !sourceNodeB || !targetNodeA || !targetNodeB) return 0;

    // First sort by source node Y position
    if (sourceNodeA.y !== sourceNodeB.y) {
      return sourceNodeA.y - sourceNodeB.y;
    }

    // If same source, sort by target node Y position
    return targetNodeA.y - targetNodeB.y;
  });

  for (const link of sortedLinks) {
    const sourceNode = nodeLayouts.find(n => n.id === link.source);
    const targetNode = nodeLayouts.find(n => n.id === link.target);

    if (!sourceNode || !targetNode) continue;

    // Calculate the proportion of this link relative to the node's total flow
    const sourceProportion = nodeOutgoingTotal[link.source] > 0
      ? link.value / nodeOutgoingTotal[link.source]
      : 1;
    const targetProportion = nodeIncomingTotal[link.target] > 0
      ? link.value / nodeIncomingTotal[link.target]
      : 1;

    // Use the actual node height multiplied by the proportion
    const sourceLinkHeight = sourceNode.height * sourceProportion;
    const targetLinkHeight = targetNode.height * targetProportion;

    linkLayouts.push({
      source: link.source,
      target: link.target,
      value: link.value,
      sourceY: sourceNode.y + nodeSourceOffsets[link.source],
      targetY: targetNode.y + nodeTargetOffsets[link.target],
      sourceHeight: sourceLinkHeight,
      targetHeight: targetLinkHeight
    });

    nodeSourceOffsets[link.source] += sourceLinkHeight;
    nodeTargetOffsets[link.target] += targetLinkHeight;
  }

  return linkLayouts;
}

function formatNumber(value: number): string {
  const absValue = Math.abs(value);

  if (absValue >= 1000000) {
    const formatted = value / 1000000;
    return (formatted % 1 === 0 ? formatted.toFixed(0) : formatted.toFixed(2)) + 'M';
  } else if (absValue >= 1000) {
    const formatted = value / 1000;
    return (formatted % 1 === 0 ? formatted.toFixed(0) : formatted.toFixed(2)) + 'k';
  } else {
    return value.toFixed(0);
  }
}

async function createChevronIcon(): Promise<SceneNode> {
  // Import chevron icon from the DT9 Icon Library
  // Component key: 1915e7256b0204a06bfa30fd424c6296e63e908b

  try {
    const component = await figma.importComponentByKeyAsync('1915e7256b0204a06bfa30fd424c6296e63e908b');
    const instance = component.createInstance();
    instance.name = "Chevron";
    // Don't resize - keep the original size from the design system
    return instance;
  } catch (error) {
    console.warn("Could not import chevron from library:", error);

    // Fallback: Create a simple chevron vector if library component not found
    const icon = figma.createVector();
    icon.name = "Chevron";

    await icon.setVectorNetworkAsync({
      vertices: [
        { x: 10, y: 4 },
        { x: 6, y: 8 },
        { x: 10, y: 12 }
      ],
      segments: [
        { start: 0, end: 1 },
        { start: 1, end: 2 }
      ],
      regions: []
    });

    icon.strokes = [{ type: 'SOLID', color: { r: 0.325, g: 0.325, b: 0.325 } }];
    icon.strokeWeight = 2;
    icon.strokeCap = "ROUND";
    icon.strokeJoin = "ROUND";
    icon.fills = [];
    icon.resize(16, 16);

    return icon;
  }
}

async function createNode(parent: FrameNode, node: NodeLayout, data: SankeyData) {
  // Create node rectangle
  const rect = figma.createRectangle();
  rect.name = `Node: ${node.label}`;
  rect.x = node.x;
  rect.y = node.y;
  rect.resize(CONFIG.nodeWidth, node.height);
  rect.fills = [{ type: 'SOLID', color: CONFIG.nodeColor }];
  rect.cornerRadius = 2;

  parent.appendChild(rect);

  // Check if this node is a leaf (has no outgoing links)
  const isLeaf = !data.links.some(link => link.source === node.id);

  // Load fonts - try SF Pro, fallback to Inter
  let fontFamily = "Inter";
  let fontStyle = "Regular";

  try {
    await figma.loadFontAsync({ family: "SF Pro", style: "Regular" });
    fontFamily = "SF Pro";
  } catch {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    fontFamily = "Inter";
  }

  // Create container frame for label and stats
  const container = figma.createFrame();
  container.name = `Label Container: ${node.label}`;
  container.layoutMode = "VERTICAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 2;
  container.fills = [];
  container.x = node.x + CONFIG.nodeWidth + 12;

  // Create label frame with chevron (if not a leaf)
  const labelFrame = figma.createFrame();
  labelFrame.name = "Label Frame";
  labelFrame.layoutMode = "HORIZONTAL";
  labelFrame.primaryAxisSizingMode = "AUTO";
  labelFrame.counterAxisSizingMode = "AUTO";
  labelFrame.counterAxisAlignItems = "CENTER";
  labelFrame.primaryAxisAlignItems = "MIN"; // Align left
  labelFrame.itemSpacing = 6;
  labelFrame.fills = [];

  // Create label text
  const labelText = figma.createText();
  labelText.name = "Title";
  labelText.fontName = { family: fontFamily, style: fontStyle };
  labelText.fontSize = 15;
  labelText.characters = node.label;
  labelText.fills = [{ type: 'SOLID', color: { r: 0.325, g: 0.325, b: 0.325 } }]; // #535353
  labelText.lineHeight = { value: 140, unit: "PERCENT" };
  
  // Add dotted underline to entire text
  labelText.textDecoration = "UNDERLINE";
  labelText.textDecorationStyle = "DOTTED";

  labelFrame.appendChild(labelText);

  // Add chevron if not a leaf (after the label)
  if (!isLeaf) {
    const chevron = await createChevronIcon();
    labelFrame.appendChild(chevron);
  }

  container.appendChild(labelFrame);

  // Format value with k notation
  const formattedValue = formatNumber(node.value);
  const formattedPercentage = node.percentage.toFixed(1);

  // Load bold font for amount
  try {
    await figma.loadFontAsync({ family: fontFamily, style: "Bold" });
  } catch {
    // If Bold not available, Regular is already loaded
  }

  // Create horizontal frame for amount and percentage with bottom alignment
  const statsFrame = figma.createFrame();
  statsFrame.name = "Main data";
  statsFrame.layoutMode = "HORIZONTAL";
  statsFrame.primaryAxisSizingMode = "AUTO";
  statsFrame.counterAxisSizingMode = "AUTO";
  statsFrame.counterAxisAlignItems = "BASELINE";
  statsFrame.itemSpacing = 4;
  statsFrame.fills = [];

  // Create amount text (bold, larger)
  const amountText = figma.createText();
  amountText.name = "Count";
  try {
    amountText.fontName = { family: fontFamily, style: "Bold" };
  } catch {
    amountText.fontName = { family: fontFamily, style: fontStyle };
  }
  amountText.fontSize = 19;
  amountText.characters = formattedValue;
  amountText.fills = [{ type: 'SOLID', color: { r: 0.227, g: 0.227, b: 0.227 } }]; // #3A3A3A
  amountText.lineHeight = { value: 120, unit: "PERCENT" };

  statsFrame.appendChild(amountText);

  // Create percentage text (smaller, aligned to baseline)
  const percentageText = figma.createText();
  percentageText.name = "Percentage Text";
  percentageText.fontName = { family: fontFamily, style: fontStyle };
  percentageText.fontSize = 12;
  percentageText.characters = `${formattedPercentage}%`;
  percentageText.fills = [{ type: 'SOLID', color: { r: 0.325, g: 0.325, b: 0.325 } }]; // #535353
  percentageText.lineHeight = { value: 120, unit: "PERCENT" };

  statsFrame.appendChild(percentageText);

  container.appendChild(statsFrame);

  // Position container: if node is taller than container + margin, align to top inside the node
  // Otherwise, center it vertically
  const containerHeight = container.height;
  const minHeightForTopAlign = containerHeight + (CONFIG.labelTopMargin * 2); // margin top + bottom

  if (node.height >= minHeightForTopAlign) {
    // Node is tall enough - align to top inside with margin
    container.y = node.y + CONFIG.labelTopMargin;
  } else {
    // Node is small - center vertically
    container.y = node.y + (node.height - containerHeight) / 2;
  }

  parent.appendChild(container);
}

async function createLink(parent: FrameNode, link: LinkLayout, nodeLayouts: NodeLayout[]) {
  const sourceNode = nodeLayouts.find(n => n.id === link.source);
  const targetNode = nodeLayouts.find(n => n.id === link.target);

  if (!sourceNode || !targetNode) return;

  const startX = sourceNode.x + CONFIG.nodeWidth;
  const endX = targetNode.x;

  // Create path data for a gradient ribbon
  const topStartY = link.sourceY;
  const topEndY = link.targetY;
  const bottomStartY = link.sourceY + link.sourceHeight;
  const bottomEndY = link.targetY + link.targetHeight;

  // Control point offset for smooth curves
  const curvature = 0.5;
  const dx = endX - startX;

  // Create SVG-style path for the flow
  const vector = figma.createVector();
  vector.name = `Link: ${link.source} → ${link.target} (${link.value})`;

  // Create vertices for the ribbon shape
  // Top edge: source top -> target top
  // Bottom edge: target bottom -> source bottom (reverse order to close path)
  await vector.setVectorNetworkAsync({
    vertices: [
      // Top edge curve from source to target
      { x: startX, y: topStartY },
      { x: endX, y: topEndY },

      // Vertical line at target
      { x: endX, y: bottomEndY },

      // Bottom edge curve from target back to source
      { x: startX, y: bottomStartY },
    ],
    segments: [
      // Top curve: smooth bezier from source to target
      {
        start: 0,
        end: 1,
        tangentStart: { x: dx * curvature, y: 0 },
        tangentEnd: { x: -dx * curvature, y: 0 }
      },
      // Right vertical line
      { start: 1, end: 2 },
      // Bottom curve: smooth bezier from target back to source
      {
        start: 2,
        end: 3,
        tangentStart: { x: -dx * curvature, y: 0 },
        tangentEnd: { x: dx * curvature, y: 0 }
      },
      // Left vertical line (close path)
      { start: 3, end: 0 },
    ],
    regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2, 3]] }]
  });

  // Set fill with transparency
  vector.fills = [{
    type: 'SOLID',
    color: CONFIG.linkColor,
    opacity: CONFIG.linkOpacity
  }];

  vector.strokes = [];

  parent.appendChild(vector);
}
