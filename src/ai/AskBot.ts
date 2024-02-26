import { LobbyPlugin } from '../plugins/LobbyPlugin';
import { Lobby } from '../Lobby';
import { Player } from '../Player';

import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { VectorStoreRetriever } from "@langchain/core/vectorstores";
// import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
// import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { formatDocumentsAsString } from "langchain/util/document";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import 'dotenv/config';

// const loader = new PDFLoader("osu_ref.pdf");
// const document = await loader.load({
//     splitPages: false,
// });

// const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 100 });
// const splits = await textSplitter.splitDocuments(document);

// const vectorStore = await HNSWLib.fromDocuments(splits, new OpenAIEmbeddings());
// vectorStore.save('./vectorstore_js');


export class AskBot extends LobbyPlugin {
  qnachain!: RunnableSequence;
  retriever!: VectorStoreRetriever<HNSWLib>;
  constructor(lobby: Lobby) {
    super(lobby, 'AskBot', 'askbot');
    this.registerEvents();
  }

  private registerEvents(){
    this.lobby.ReceivedChatCommand.on(a => this.onChatCommand(a.player, a.command, a.param));
  }

  static async create(lobby: Lobby): Promise<AskBot> {
    const instance = new AskBot(lobby);
    await instance.initializeModel();
    return instance;
  }

  private onChatCommand(player: Player, command: string, param: string): void {
    if (command === '!ask') {
      this.onAskCommand(player, param).then(response => {
        this.lobby.SendMessage(response);
      }).catch(err => {
        this.lobby.SendMessage(err.message);
      });
    }
  }

  private async initializeModel(): Promise<void>{
    const vectorStore = await HNSWLib.load('./src/ai/vectorstore_js', new OpenAIEmbeddings());
    const retriever = vectorStore.asRetriever();
    
    const template = `Use the following pieces of context to answer the question at the end.
    Use three sentences maximum and keep the answer as concise as possible. Address the player by name.
    Context: {context}
    
    Question: {question}
    Asked by: {player}

    Helpful Answer:`
    
    const customPrompt = PromptTemplate.fromTemplate(template)
    
    const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

    //old method when only have question and context
    // const chain = RunnableSequence.from([
    //   {
    //     context: retriever.pipe(formatDocumentsAsString),
    //     question: new RunnablePassthrough(),
    //   },
    //   prompt,
    //   llm,
    //   new StringOutputParser()
    // ]);

    const ragChain = await createStuffDocumentsChain({
      llm,
      prompt: customPrompt,
      outputParser: new StringOutputParser(),
    })

    this.qnachain = ragChain;
    this.retriever = retriever;
    this.logger.info('Model initialized');
  }

  private async onAskCommand(player: Player, question: string): Promise<string> {
    if (question.length == 0) {
      throw new Error('Please ask a question! Usage: !ask <question>');
    }
    const context = await this.retriever.getRelevantDocuments(question);
    const response = await this.qnachain.invoke({
      question: question,
      player: player.name,
      context
    })
    
    return response;
  }
}
