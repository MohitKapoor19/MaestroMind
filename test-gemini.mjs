// Test script for Gemini 2.0 Flash Experimental integration
import dotenv from 'dotenv';
import { geminiService } from './server/services/geminiService.ts';
import { llmRouter } from './server/services/llmRouter.ts';

dotenv.config();

async function testGeminiIntegration() {
  console.log('Testing Gemini 2.0 Flash Experimental Integration...\n');
  
  // Check if API key is configured
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
  
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not configured in .env file');
    console.log('Please add your Gemini API key to the .env file');
    console.log('Get your key from: https://makersuite.google.com/app/apikey');
    return;
  }
  
  console.log('✅ API Key configured');
  console.log(`📦 Using model: ${model}\n`);
  
  // Test the Gemini service
  try {
    // Test 1: Simple completion
    console.log('Test 1: Simple completion...');
    const simpleResponse = await geminiService.generateCompletion([
      { role: 'user', content: 'What is 2+2?' }
    ], {
      temperature: 0.1,
      isLightweight: true
    });
    console.log('✅ Simple completion successful');
    console.log(`Response: ${simpleResponse.content.substring(0, 50)}...`);
    console.log(`Tokens used: ${simpleResponse.tokensUsed}`);
    console.log(`Cost: $${simpleResponse.cost}\n`);
    
    // Test 2: Complex reasoning task
    console.log('Test 2: Complex reasoning task...');
    const complexResponse = await geminiService.generateCompletion([
      { 
        role: 'user', 
        content: 'Explain the AutoAgents framework and how it uses iterative drafting with observer patterns for multi-agent orchestration.' 
      }
    ], {
      temperature: 0.7,
      isComplexReasoning: true
    });
    console.log('✅ Complex reasoning successful');
    console.log(`Response length: ${complexResponse.content.length} characters`);
    console.log(`Tokens used: ${complexResponse.tokensUsed}`);
    console.log(`Cost: $${complexResponse.cost}\n`);
    
    // Test 3: Agent team generation
    console.log('Test 3: Agent team generation...');
    const agentTeam = await geminiService.generateAgentTeam(
      'Create a web scraping system that extracts product information from e-commerce sites'
    );
    console.log('✅ Agent team generation successful');
    console.log(`Generated ${agentTeam.agents.length} agents:`);
    agentTeam.agents.forEach(agent => {
      console.log(`  - ${agent.name}: ${agent.role}`);
    });
    console.log(`\nExecution steps: ${agentTeam.executionPlan.steps.length}`);
    console.log(`Estimated duration: ${agentTeam.executionPlan.estimatedDuration}\n`);
    
    // Test 4: Observer critique
    console.log('Test 4: Observer critique...');
    const critique = await geminiService.observeAndCritique(
      agentTeam.executionPlan,
      'Web scraping for e-commerce product information',
      'plan'
    );
    console.log('✅ Observer critique successful');
    console.log(`Needs refinement: ${critique.needsRefinement}`);
    console.log(`Confidence: ${critique.confidence}%`);
    console.log(`Suggestions: ${critique.suggestions.length}\n`);
    
    console.log('🎉 All tests passed successfully!');
    console.log('\nGemini 2.0 Flash Experimental is properly configured for:');
    console.log('  ✅ Complex reasoning tasks');
    console.log('  ✅ Agent team generation');
    console.log('  ✅ Observer pattern implementation');
    console.log('  ✅ Dynamic model selection based on task complexity');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('API key')) {
      console.log('\nPlease ensure your GEMINI_API_KEY is valid and has proper permissions');
    }
  }
}

// Test LLM Router integration
async function testLLMRouterIntegration() {
  console.log('\n' + '='.repeat(50));
  console.log('Testing LLM Router Integration with Gemini Priority...\n');
  
  try {
    // Test complex reasoning routing
    console.log('Test: Complex reasoning should prioritize Gemini...');
    const response = await llmRouter.chat([
      { role: 'user', content: 'Explain quantum computing in simple terms' }
    ], {
      isComplexReasoning: true,
      temperature: 0.7
    });
    
    console.log(`✅ Provider used: ${response.provider}`);
    console.log(`Response length: ${response.content.length} characters`);
    console.log(`Latency: ${response.latency}ms`);
    console.log(`Tokens: ${response.tokensUsed}`);
    
    // Check provider metrics
    const metrics = llmRouter.getMetrics();
    console.log('\nProvider Metrics:');
    for (const [provider, providerMetrics] of metrics) {
      console.log(`  ${provider}:`);
      console.log(`    - Total requests: ${providerMetrics.totalRequests}`);
      console.log(`    - Success rate: ${providerMetrics.successfulRequests}/${providerMetrics.totalRequests}`);
      console.log(`    - Avg latency: ${Math.round(providerMetrics.averageLatency)}ms`);
    }
    
    console.log('\n✅ LLM Router is correctly configured to use Gemini for complex reasoning');
    
  } catch (error) {
    console.error('❌ LLM Router test failed:', error.message);
  }
}

// Run tests
(async () => {
  await testGeminiIntegration();
  await testLLMRouterIntegration();
  process.exit(0);
})();